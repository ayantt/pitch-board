# Multi-stage build
FROM golang:1.25-alpine AS builder

WORKDIR /app

# Download dependencies first for better layer caching
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build the binary
RUN CGO_ENABLED=0 GOOS=linux go build -o server ./cmd/server

# Runtime image
FROM alpine:3.20

RUN apk --no-cache add ca-certificates

WORKDIR /app

# Copy the compiled binary
COPY --from=builder /app/server .

# Render configuration
ENV PORT=8080
ENV SOFASCORE_BASE_URL=https://www.sofascore.com/api/v1

EXPOSE 8080

CMD ["./server"]