package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
	"github.com/ayantt/pitch-board/internal/handler"
	"github.com/ayantt/pitch-board/internal/client"
	"github.com/ayantt/pitch-board/internal/sofascore"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	baseURL := os.Getenv("SOFASCORE_BASE_URL")
	if baseURL == "" {
		baseURL = "https://www.sofascore.com/api/v1"
	}

	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))

	httpClient := client.New(baseURL, logger)
	provider := sofascore.New(httpClient, logger)
	h := handler.New(provider, logger)

	e := echo.New()
	e.Logger = nil
	e.HideBanner = true
	e.HidePort = true

	e.Use(middleware.Recover())
	e.Use(corsMiddleware())
	e.Use(slogMiddleware(logger))

	e.GET("/health", h.Health)
	e.GET("/api/event", h.GetEvent)
	e.GET("/api/incidents", h.GetIncidents)
	e.GET("/api/statistics", h.GetStatistics)
	e.GET("/api/graph", h.GetGraph)

	server := &http.Server{
		Addr:    ":" + port,
		Handler: e,
	}

	// Start HTTP server.
	go func() {
		logger.Info("starting server", slog.String("addr", ":"+port))

		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Error("server failed", slog.Any("error", err))
			os.Exit(1)
		}
	}()

	// Wait for termination signal.
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	logger.Info("shutting down server", slog.String("addr", ":"+port))

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		logger.Error("server shutdown error", slog.Any("error", err))
	}

	logger.Info("server stopped")
}

func corsMiddleware() echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			c.Response().Header().Set("Access-Control-Allow-Origin", "*")
			c.Response().Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
			c.Response().Header().Set("Access-Control-Allow-Headers", "Content-Type, Accept")
			if c.Request().Method == echo.OPTIONS {
				return c.NoContent(http.StatusNoContent)
			}
			return next(c)
		}
	}
}

type slogAdapter struct {
	logger *slog.Logger
}

func (a *slogAdapter) Write(p []byte) (n int, err error) {
	a.logger.Debug(string(p))
	return len(p), nil
}

func slogMiddleware(logger *slog.Logger) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			err := next(c)
			logger.Info("request", slog.String("method", c.Request().Method), slog.String("path", c.Request().URL.Path), slog.Int("status", c.Response().Status))
			if err != nil {
				logger.Error("request error", slog.Any("error", err))
			}
			return err
		}
	}
}
