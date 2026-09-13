package sofascore

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/ayantt/pitch-board/internal/client"
)

type Provider struct {
	httpClient *client.SofaScoreClient
	Logger     *slog.Logger
}

func New(httpClient *client.SofaScoreClient, logger *slog.Logger) *Provider {
	return &Provider{
		httpClient: httpClient,
		Logger:     logger,
	}
}

func (p *Provider) Fetch(id int, suffix string) ([]byte, int, error) {
	path := fmt.Sprintf("/event/%s%s", strconv.Itoa(id), suffix)
	req, err := p.httpClient.NewRequest(path)
	if err != nil {
		return nil, 0, err
	}

	resp, err := p.httpClient.HTTP.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()

	body := make([]byte, 0, 512)
	buf := make([]byte, 4096)
	for {
		n, readErr := resp.Body.Read(buf)
		if n > 0 {
			body = append(body, buf[:n]...)
		}
		if readErr != nil {
			break
		}
	}

	return body, resp.StatusCode, nil
}

func (p *Provider) Event(id int) (json.RawMessage, int, error) {
	body, status, err := p.Fetch(id, "")
	if err != nil {
		return nil, status, err
	}
	if status != http.StatusOK {
		return nil, status, nil
	}
	var raw json.RawMessage
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, 0, err
	}
	return raw, http.StatusOK, nil
}

func (p *Provider) Incidents(id int) (json.RawMessage, int, error) {
	body, status, err := p.Fetch(id, "/incidents")
	if err != nil {
		return nil, status, err
	}
	if status != http.StatusOK {
		return nil, status, nil
	}
	var raw json.RawMessage
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, 0, err
	}
	return raw, http.StatusOK, nil
}

func (p *Provider) Statistics(id int) (json.RawMessage, int, error) {
	body, status, err := p.Fetch(id, "/statistics")
	if err != nil {
		return nil, status, err
	}
	if status != http.StatusOK {
		return nil, status, nil
	}
	var raw json.RawMessage
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, 0, err
	}
	return raw, http.StatusOK, nil
}

func (p *Provider) Graph(id int) (json.RawMessage, int, error) {
	body, status, err := p.Fetch(id, "/graph")
	if err != nil {
		return nil, status, err
	}
	if status != http.StatusOK {
		return nil, status, nil
	}
	var raw json.RawMessage
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, 0, err
	}
	return raw, http.StatusOK, nil
}
