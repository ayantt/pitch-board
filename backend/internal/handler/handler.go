package handler

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/labstack/echo/v4"
	"github.com/ayantt/pitch-board/internal/sofascore"
)

type Handler struct {
	Provider *sofascore.Provider
	Logger   *slog.Logger
}

func New(provider *sofascore.Provider, logger *slog.Logger) *Handler {
	return &Handler{
		Provider: provider,
		Logger:   logger,
	}
}

func (h *Handler) Health(c echo.Context) error {
	return c.JSON(http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handler) GetEvent(c echo.Context) error {
	id, err := validateID(c.QueryParam("id"))
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "Missing or invalid 'id' query parameter"})
	}

	data, status, err := h.Provider.Event(id)
	if err != nil {
		h.Logger.Error("event fetch error", slog.Int("id", id), slog.Any("error", err))
		return c.JSON(normalizeStatus(status), map[string]string{"error": "Failed to fetch event"})
	}
	if status != http.StatusOK {
		return c.JSON(normalizeStatus(status), map[string]string{"error": "Event not found"})
	}
	return writeWrapped(c, "event", data)
}

func (h *Handler) GetIncidents(c echo.Context) error {
	id, err := validateID(c.QueryParam("id"))
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "Missing or invalid 'id' query parameter"})
	}

	data, status, err := h.Provider.Incidents(id)
	if err != nil {
		h.Logger.Error("incidents fetch error", slog.Int("id", id), slog.Any("error", err))
		return c.JSON(normalizeStatus(status), map[string]string{"error": "Failed to fetch incidents"})
	}
	if status != http.StatusOK {
		return c.JSON(normalizeStatus(status), map[string]string{"error": "Incidents not found"})
	}
	return writeWrapped(c, "incidents", data)
}

func (h *Handler) GetStatistics(c echo.Context) error {
	id, err := validateID(c.QueryParam("id"))
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "Missing or invalid 'id' query parameter"})
	}

	data, status, err := h.Provider.Statistics(id)
	if err != nil {
		h.Logger.Error("statistics fetch error", slog.Int("id", id), slog.Any("error", err))
		return c.JSON(normalizeStatus(status), map[string]string{"error": "Failed to fetch statistics"})
	}
	if status != http.StatusOK {
		return c.JSON(normalizeStatus(status), map[string]string{"error": "Statistics not found"})
	}
	return writeWrapped(c, "statistics", data)
}

func (h *Handler) GetGraph(c echo.Context) error {
	id, err := validateID(c.QueryParam("id"))
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "Missing or invalid 'id' query parameter"})
	}

	data, status, err := h.Provider.Graph(id)
	if err != nil {
		h.Logger.Error("graph fetch error", slog.Int("id", id), slog.Any("error", err))
		return c.JSON(normalizeStatus(status), map[string]string{"error": "Failed to fetch graph"})
	}
	if status != http.StatusOK {
		return c.JSON(normalizeStatus(status), map[string]string{"error": "Graph not found"})
	}
	return writeWrapped(c, "graphPoints", data)
}

func validateID(raw string) (int, error) {
	if raw == "" {
		return 0, errInvalid
	}
	id, err := strconv.Atoi(raw)
	if err != nil || id <= 0 {
		return 0, errInvalid
	}
	return id, nil
}

func normalizeStatus(upstream int) int {
	switch {
	case upstream == 0:
		return http.StatusBadGateway
	case upstream >= 500:
		return http.StatusBadGateway
	case upstream == 404:
		return http.StatusNotFound
	default:
		return upstream
	}
}

func writeWrapped(c echo.Context, key string, data json.RawMessage) error {
	wrapper := map[string]json.RawMessage{key: data}
	return c.JSON(http.StatusOK, wrapper)
}

var errInvalid = new(errorString)

type errorString string

func (e *errorString) Error() string { return string(*e) }
