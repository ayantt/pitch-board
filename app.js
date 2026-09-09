const REFRESH_INTERVAL = 10000;

const STORAGE_LAYOUT_KEY = "matchDashboardLayout";

const matchState = [
    {
        scoreInitialized: false,
        homeScore: null,
        awayScore: null
    },
    {
        scoreInitialized: false,
        homeScore: null,
        awayScore: null
    },
    {
        scoreInitialized: false,
        homeScore: null,
        awayScore: null
    },
    {
        scoreInitialized: false,
        homeScore: null,
        awayScore: null
    }
];


/* =========================================================
   HELPERS
========================================================= */

function getMatch(index) {
    return document.querySelector(
        `.match[data-index="${index}"]`
    );
}


function getSidebarEventId(index) {
    const input = document.getElementById(
        `sidebar-event-${index + 1}`
    );

    if (!input) {
        return "";
    }

    return input.value.trim();
}


function saveEventId(index, eventId) {
    const input = document.getElementById(
        `sidebar-event-${index + 1}`
    );

    if (input) {
        input.value = eventId;
    }

    localStorage.setItem(
        `matchEventId-${index}`,
        eventId
    );
}


function loadSavedEventIds() {

    for (let index = 0; index < 4; index++) {

        const saved = localStorage.getItem(
            `matchEventId-${index}`
        );

        if (!saved) {
            continue;
        }

        const input = document.getElementById(
            `sidebar-event-${index + 1}`
        );

        if (input) {
            input.value = saved;
        }
    }
}


function getEventId(match) {

    if (!match) {
        return "";
    }

    const index = Number(
        match.dataset.index
    );

    return getSidebarEventId(index);
}


/* =========================================================
   TRACKER
========================================================= */

function updateTracker(match, eventId) {

    if (!match || !eventId) {
        return;
    }

    const tracker = match.querySelector(
        ".tracker"
    );

    if (!tracker) {
        return;
    }

    const trackerUrl =
        `https://www.sofascore.com/api/v1/event/${eventId}/live-match-tracker/en/invert-teams/false`;

    const currentUrl =
        tracker.getAttribute("src");

    if (currentUrl !== trackerUrl) {
        tracker.setAttribute(
            "src",
            trackerUrl
        );
    }
}


/* =========================================================
   FETCH
========================================================= */

async function fetchJson(url) {

    const response = await fetch(url, {
        cache: "no-store"
    });

    if (!response.ok) {
        throw new Error(
            `HTTP ${response.status}`
        );
    }

    return response.json();
}


/* =========================================================
   EVENT
========================================================= */

async function updateEvent(
    match,
    eventData,
    index
) {

    const event = eventData.event;

    if (!event) {
        return;
    }


    /* Teams */

    const homeName =
        match.querySelector(".home-name");

    const awayName =
        match.querySelector(".away-name");

    if (homeName) {
        homeName.textContent =
            event.homeTeam?.name || "—";
    }

    if (awayName) {
        awayName.textContent =
            event.awayTeam?.name || "—";
    }


    /* Logos */

    const homeLogo =
        match.querySelector(".home-logo");

    const awayLogo =
        match.querySelector(".away-logo");


    if (
        homeLogo &&
        event.homeTeam?.id
    ) {

        homeLogo.src =
            `https://img.sofascore.com/api/v1/team/${event.homeTeam.id}/image`;

        homeLogo.alt =
            event.homeTeam.name || "";
    }


    if (
        awayLogo &&
        event.awayTeam?.id
    ) {

        awayLogo.src =
            `https://img.sofascore.com/api/v1/team/${event.awayTeam.id}/image`;

        awayLogo.alt =
            event.awayTeam.name || "";
    }


    /* Score */

    const homeScore =
        event.homeScore?.current ?? 0;

    const awayScore =
        event.awayScore?.current ?? 0;


    const homeScoreElement =
        match.querySelector(".home-score");

    const awayScoreElement =
        match.querySelector(".away-score");


    if (homeScoreElement) {
        homeScoreElement.textContent =
            homeScore;
    }

    if (awayScoreElement) {
        awayScoreElement.textContent =
            awayScore;
    }


    /* Status */

    const status =
        match.querySelector(".status");

    if (status) {

        let statusText =
            event.status?.description ||
            event.status?.type ||
            "—";

        if (
            event.status?.type === "inprogress" &&
            event.status?.description
        ) {
            statusText =
                event.status.description;
        }

        status.textContent =
            statusText;
    }


    /* Competition */

    const competition =
        match.querySelector(".competition");

    if (competition) {

        competition.textContent =
            event.tournament?.name ||
            "—";
    }


    /* Goal detection */

    const state =
        matchState[index];

    if (
        state.scoreInitialized &&
        (
            homeScore > state.homeScore ||
            awayScore > state.awayScore
        )
    ) {

        showGoalAlert(match);
    }


    state.homeScore =
        homeScore;

    state.awayScore =
        awayScore;

    state.scoreInitialized =
        true;
}


/* =========================================================
   GOAL ALERT
========================================================= */

function showGoalAlert(match) {

    const alert =
        match.querySelector(".goal-alert");

    if (!alert) {
        return;
    }

    alert.classList.remove("show");

    void alert.offsetWidth;

    alert.classList.add("show");

    setTimeout(() => {
        alert.classList.remove("show");
    }, 2200);
}


/* =========================================================
   STATISTICS
========================================================= */

function findStatistic(
    statistics,
    possibleNames
) {

    if (!statistics) {
        return null;
    }


    for (const group of statistics) {

        const items =
            group.statisticsItems || [];

        for (const item of items) {

            const name =
                String(item.name || "")
                    .toLowerCase();

            for (const possibleName of possibleNames) {

                if (
                    name ===
                    possibleName.toLowerCase()
                ) {
                    return item;
                }
            }
        }
    }

    return null;
}


function formatStatisticValue(
    item,
    side
) {

    if (!item) {
        return "—";
    }

    const value =
        side === "home"
            ? item.home
            : item.away;

    if (
        value === undefined ||
        value === null
    ) {
        return "—";
    }

    if (
        item.renderType === "PERCENTAGE" ||
        item.name === "Ball possession"
    ) {

        if (
            typeof value === "number"
        ) {
            return `${value}%`;
        }

        return String(value);
    }

    return String(value);
}


async function updateStatistics(
    match,
    statisticsData
) {

    const groups =
        statisticsData.statistics || [];

    const allStatistics = [];

    for (const period of groups) {

        if (
            period.groups &&
            Array.isArray(period.groups)
        ) {

            allStatistics.push(
                ...period.groups
            );
        }
    }


    const possession =
        findStatistic(
            allStatistics,
            [
                "Ball possession",
                "Possession"
            ]
        );


    const shots =
        findStatistic(
            allStatistics,
            [
                "Total shots",
                "Shots"
            ]
        );


    const corners =
        findStatistic(
            allStatistics,
            [
                "Corner kicks",
                "Corners"
            ]
        );


    const homePossession =
        match.querySelector(
            ".home-possession"
        );

    const awayPossession =
        match.querySelector(
            ".away-possession"
        );


    const homeShots =
        match.querySelector(
            ".home-shots"
        );

    const awayShots =
        match.querySelector(
            ".away-shots"
        );


    const homeCorners =
        match.querySelector(
            ".home-corners"
        );

    const awayCorners =
        match.querySelector(
            ".away-corners"
        );


    if (homePossession) {
        homePossession.textContent =
            formatStatisticValue(
                possession,
                "home"
            );
    }

    if (awayPossession) {
        awayPossession.textContent =
            formatStatisticValue(
                possession,
                "away"
            );
    }


    if (homeShots) {
        homeShots.textContent =
            formatStatisticValue(
                shots,
                "home"
            );
    }

    if (awayShots) {
        awayShots.textContent =
            formatStatisticValue(
                shots,
                "away"
            );
    }


    if (homeCorners) {
        homeCorners.textContent =
            formatStatisticValue(
                corners,
                "home"
            );
    }

    if (awayCorners) {
        awayCorners.textContent =
            formatStatisticValue(
                corners,
                "away"
            );
    }
}


/* =========================================================
   MOMENTUM
========================================================= */

function updateMomentum(
    match,
    graphData
) {

    const graphPoints =
        graphData.graphPoints || [];

    if (!graphPoints.length) {
        return;
    }


    let positive = 0;
    let negative = 0;


    for (const point of graphPoints) {

        const value =
            Number(point.value) || 0;

        if (value > 0) {
            positive += value;
        }

        if (value < 0) {
            negative += Math.abs(value);
        }
    }


    const total =
        positive + negative;


    if (total <= 0) {
        return;
    }


    const homePercent =
        (positive / total) * 100;

    const awayPercent =
        100 - homePercent;


    const homeFill =
        match.querySelector(
            ".momentum-home"
        );

    const awayFill =
        match.querySelector(
            ".momentum-away"
        );


    if (homeFill) {
        homeFill.style.width =
            `${homePercent}%`;
    }

    if (awayFill) {
        awayFill.style.width =
            `${awayPercent}%`;
    }
}


/* =========================================================
   INCIDENT HELPERS
========================================================= */

function getPlayerName(player) {

    if (!player) {
        return "";
    }

    return (
        player.name ||
        player.shortName ||
        ""
    );
}


function getIncidentTime(incident) {

    if (
        incident.time === undefined ||
        incident.time === null
    ) {
        return "";
    }

    let time =
        String(incident.time);

    if (
        incident.addedTime !== undefined &&
        incident.addedTime !== null &&
        Number(incident.addedTime) > 0
    ) {

        time +=
            `+${incident.addedTime}`;
    }

    return `${time}'`;
}


/* =========================================================
   INCIDENT ELEMENT
========================================================= */

function createIncidentElement(
    incident
) {

    const element =
        document.createElement("div");

    element.className =
        "incident-item";


    const icon =
        document.createElement("span");

    icon.className =
        "incident-icon";


    const time =
        document.createElement("span");

    time.className =
        "incident-time";

    time.textContent =
        getIncidentTime(incident);


    const player =
        document.createElement("span");

    player.className =
        "incident-player";


    /* =========================
       GOAL
    ========================== */

    if (
        incident.incidentType === "goal"
    ) {

        element.classList.add("goal");

        icon.textContent = "⚽";


        const scorer =
            getPlayerName(
                incident.player
            );

        player.textContent =
            scorer || "Goal";

    }


    /* =========================
       CARD
    ========================== */

    else if (
        incident.incidentType === "card"
    ) {

        element.classList.add("card");


        const cardClass =
            String(
                incident.incidentClass || ""
            ).toLowerCase();


        if (cardClass.includes("red")) {
            icon.textContent = "🟥";
        }

        else if (
            cardClass.includes("yellow")
        ) {
            icon.textContent = "🟨";
        }

        else {
            icon.textContent = "🟨";
        }


        player.textContent =
            getPlayerName(
                incident.player
            );
    }


    /* =========================
       SUBSTITUTION
    ========================== */

    else if (
        incident.incidentType ===
        "substitution"
    ) {

        element.classList.add(
            "substitution"
        );


        /*
         * SofaScore substitutions contain:
         *
         * playerIn
         * playerOut
         *
         * They do NOT normally use
         * incident.player for both names.
         */

        const playerIn =
            getPlayerName(
                incident.playerIn
            );

        const playerOut =
            getPlayerName(
                incident.playerOut
            );


        icon.textContent = "↕";


        if (
            playerIn &&
            playerOut
        ) {

            player.textContent =
                `${playerIn} ↕ ${playerOut}`;

        }

        else if (playerIn) {

            player.textContent =
                `↕ ${playerIn}`;

        }

        else if (playerOut) {

            player.textContent =
                `↕ ${playerOut}`;

        }

        else {

            /*
             * Some SofaScore responses can
             * expose playerName as fallback.
             */

            player.textContent =
                incident.playerName ||
                "Substitution";
        }

    }


    /* =========================
       OTHER INCIDENT
    ========================== */

    else {

        const incidentType =
            String(
                incident.incidentType || ""
            ).toLowerCase();


        if (
            incidentType.includes("var")
        ) {
            icon.textContent = "VAR";
        }

        else if (
            incidentType.includes("penalty")
        ) {
            icon.textContent = "●";
        }

        else {
            icon.textContent = "•";
        }


        player.textContent =
            incident.text ||
            incident.playerName ||
            "";
    }


    element.appendChild(icon);

    if (time.textContent) {
        element.appendChild(time);
    }

    element.appendChild(player);


    return element;
}


/* =========================================================
   INCIDENTS
========================================================= */

function updateIncidents(
    match,
    incidentsData
) {

    const list =
        match.querySelector(
            ".incident-list"
        );

    if (!list) {
        return;
    }


    let homeColumn =
        list.querySelector(
            ".incident-column-home"
        );

    let awayColumn =
        list.querySelector(
            ".incident-column-away"
        );


    if (!homeColumn) {

        homeColumn =
            document.createElement("div");

        homeColumn.className =
            "incident-column-home";

        list.appendChild(
            homeColumn
        );
    }


    if (!awayColumn) {

        awayColumn =
            document.createElement("div");

        awayColumn.className =
            "incident-column-away";

        list.appendChild(
            awayColumn
        );
    }


    /*
     * Only clear the two columns.
     * Do not clear .incident-list itself.
     */

    homeColumn.innerHTML = "";
    awayColumn.innerHTML = "";


    const incidents =
        incidentsData.incidents || [];


    /*
     * Show the latest incidents first.
     *
     * This prevents the overlay from filling
     * the entire pitch when a match has many
     * historical incidents.
     */

    const relevantIncidents =
        incidents
            .filter(
                incident =>
                    incident.incidentType === "goal" ||
                    incident.incidentType === "card" ||
                    incident.incidentType === "substitution"
            )
            .slice(-10);


    for (const incident of relevantIncidents) {

        const element =
            createIncidentElement(
                incident
            );


        if (incident.isHome) {

            homeColumn.appendChild(
                element
            );

        }

        else {

            awayColumn.appendChild(
                element
            );
        }
    }
}


/* =========================================================
   UPDATE INDICATOR
========================================================= */

function updateIndicator(match) {

    const indicator =
        match.querySelector(
            ".update-indicator"
        );

    if (!indicator) {
        return;
    }

    const now =
        new Date();

    indicator.textContent =
        `Updated ${now.toLocaleTimeString(
            [],
            {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit"
            }
        )}`;
}


/* =========================================================
   REFRESH MATCH
========================================================= */

async function refreshMatch(
    match,
    index
) {

    if (!match) {
        return;
    }


    const eventId =
        getEventId(match);


    if (!eventId) {
        return;
    }


    /*
     * IMPORTANT:
     *
     * Always update the tracker iframe
     * before making API requests.
     */

    updateTracker(
        match,
        eventId
    );


    try {

        /*
         * Route all SofaScore API calls through the server-side
         * proxy (/api/sofascore) to avoid 403 Forbidden errors in
         * production. The proxy adds the necessary Referer/Origin
         * headers that SofaScore requires.
         */
        const proxyBase =
            `/api/sofascore?path=/event/${eventId}`;


        const [
            eventData,
            incidentsData,
            statisticsData,
            graphData
        ] = await Promise.all([
            fetchJson(proxyBase),
            fetchJson(`${proxyBase}/incidents`),
            fetchJson(`${proxyBase}/statistics`),
            fetchJson(`${proxyBase}/graph`)
        ]);


        await updateEvent(
            match,
            eventData,
            index
        );


        await updateStatistics(
            match,
            statisticsData
        );


        updateIncidents(
            match,
            incidentsData
        );


        updateMomentum(
            match,
            graphData
        );


        updateIndicator(
            match
        );

    }

    catch (error) {

        console.error(
            `Failed to refresh match ${index + 1}:`,
            error
        );


        const indicator =
            match.querySelector(
                ".update-indicator"
            );

        if (indicator) {

            indicator.textContent =
                "Update failed";
        }
    }
}


/* =========================================================
   REFRESH ALL
========================================================= */

function refreshVisibleMatches() {

    const matches =
        document.querySelectorAll(
            ".match"
        );


    matches.forEach(
        (match, index) => {

            const style =
                window.getComputedStyle(
                    match
                );


            if (
                style.display === "none"
            ) {
                return;
            }


            refreshMatch(
                match,
                index
            );
        }
    );
}


/* =========================================================
   LAYOUT
========================================================= */

function setLayout(layout) {

    const grid =
        document.getElementById(
            "matchGrid"
        );

    if (!grid) {
        return;
    }


    grid.classList.remove(
        "layout-1x1",
        "layout-1x2",
        "layout-2x2"
    );


    grid.classList.add(
        `layout-${layout}`
    );


    document
        .querySelectorAll(".layout-button")
        .forEach(button => {

            button.classList.toggle(
                "active",
                button.dataset.layout === layout
            );

        });


    localStorage.setItem(
        STORAGE_LAYOUT_KEY,
        layout
    );


    /*
     * Give the browser a frame to resize
     * the containers before refreshing.
     */

    requestAnimationFrame(() => {
        refreshVisibleMatches();
    });
}


function restoreLayout() {

    const saved =
        localStorage.getItem(
            STORAGE_LAYOUT_KEY
        );


    const layout =
        saved === "1x1" ||
        saved === "1x2" ||
        saved === "2x2"
            ? saved
            : "2x2";


    setLayout(layout);
}


/* =========================================================
   SIDEBAR
========================================================= */

function setupSidebar() {

    const sidebar =
        document.getElementById(
            "sidebar"
        );

    const hideButton =
        document.getElementById(
            "hideSidebar"
        );

    const showButton =
        document.getElementById(
            "showSidebar"
        );


    if (
        hideButton &&
        sidebar
    ) {

        hideButton.addEventListener(
            "click",
            () => {

                sidebar.classList.add(
                    "hidden"
                );

                if (showButton) {
                    showButton.classList.add(
                        "visible"
                    );
                }
            }
        );
    }


    if (
        showButton &&
        sidebar
    ) {

        showButton.addEventListener(
            "click",
            () => {

                sidebar.classList.remove(
                    "hidden"
                );

                showButton.classList.remove(
                    "visible"
                );
            }
        );
    }
}


/* =========================================================
   SIDEBAR MATCH BUTTONS
========================================================= */

function setupSidebarControls() {

    document
        .querySelectorAll(
            ".sidebar-go-button"
        )
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    const index =
                        Number(
                            button.dataset.sidebarGo
                        );


                    const input =
                        document.getElementById(
                            `sidebar-event-${index + 1}`
                        );


                    if (!input) {
                        return;
                    }


                    const eventId =
                        input.value.trim();


                    if (!eventId) {
                        return;
                    }


                    saveEventId(
                        index,
                        eventId
                    );


                    const match =
                        getMatch(index);


                    if (match) {

                        /*
                         * Reset score state so
                         * the new match does not
                         * trigger a fake goal.
                         */

                        matchState[index] = {
                            scoreInitialized: false,
                            homeScore: null,
                            awayScore: null
                        };


                        refreshMatch(
                            match,
                            index
                        );
                    }
                }
            );
        });


    document
        .querySelectorAll(
            ".sidebar-event-input"
        )
        .forEach(input => {

            input.addEventListener(
                "keydown",
                event => {

                    if (
                        event.key !== "Enter"
                    ) {
                        return;
                    }


                    const matchNumber =
                        input.id
                            .replace(
                                "sidebar-event-",
                                ""
                            );


                    const index =
                        Number(matchNumber) - 1;


                    const button =
                        document.querySelector(
                            `[data-sidebar-go="${index}"]`
                        );


                    if (button) {
                        button.click();
                    }
                }
            );
        });
}


/* =========================================================
   LAYOUT BUTTONS
========================================================= */

function setupLayoutButtons() {

    document
        .querySelectorAll(
            ".layout-button"
        )
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    const layout =
                        button.dataset.layout;

                    setLayout(
                        layout
                    );
                }
            );
        });
}


/* =========================================================
   FULLSCREEN
========================================================= */

function setupFullscreen() {

    document
        .querySelectorAll(".match")
        .forEach(match => {

            match.addEventListener(
                "dblclick",
                event => {

                    /*
                     * Don't trigger fullscreen
                     * when double-clicking inside
                     * the iframe.
                     */

                    if (
                        event.target.closest(
                            "iframe"
                        )
                    ) {
                        return;
                    }


                    match.classList.toggle(
                        "fullscreen"
                    );
                }
            );
        });


    document.addEventListener(
        "keydown",
        event => {

            if (
                event.key !== "Escape"
            ) {
                return;
            }


            document
                .querySelectorAll(
                    ".match.fullscreen"
                )
                .forEach(match => {

                    match.classList.remove(
                        "fullscreen"
                    );

                });
        }
    );
}


/* =========================================================
   INITIALIZATION
========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    () => {

        loadSavedEventIds();

        setupSidebar();

        setupSidebarControls();

        setupLayoutButtons();

        setupFullscreen();

        restoreLayout();


        /*
         * Initial load.
         */

        refreshVisibleMatches();


        /*
         * Automatic refresh.
         */

        setInterval(
            refreshVisibleMatches,
            REFRESH_INTERVAL
        );
    }
);