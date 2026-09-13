package client

import (
	"log/slog"
	"net/http"
	"time"
)

type SofaScoreClient struct {
	BaseURL string
	HTTP    *http.Client
	Logger  *slog.Logger
}

func New(baseURL string, logger *slog.Logger) *SofaScoreClient {
	return &SofaScoreClient{
		BaseURL: baseURL,
		HTTP: &http.Client{
			Timeout: 10 * time.Second,
		},
		Logger: logger,
	}
}

func (c *SofaScoreClient) NewRequest(path string) (*http.Request, error) {
	url := c.BaseURL + path
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "application/json, text/plain, */*")
	req.Header.Set("Accept-Language", "en-US,en;q=0.9")
	req.Header.Set("Referer", "https://www.sofascore.com/")
	req.Header.Set("Origin", "https://www.sofascore.com")
	req.Header.Set("Cache-Control", "no-cache")
	return req, nil
}
