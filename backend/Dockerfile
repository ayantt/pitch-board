#multi-stage build
FROM golang:1.25-alpine AS builder
WORKDIR /app
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY . .
RUN cd backend && CGO_ENABLED=0 GOOS=linux go build -o server ./cmd/server

FROM alpine:3.20
RUN apk --no-cache add ca-certificates
WORKDIR /app
COPY --from=builder /app/backend/server /app/server
ENV PORT=8080
ENV SOFASCORE_BASE_URL=https://www.sofascore.com/api/v1
EXPOSE 8080
CMD ["/app/server"]
