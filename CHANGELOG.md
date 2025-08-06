# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2024-01-XX

### Added
- Initial release of DXtrade TypeScript SDK
- Complete REST API coverage for accounts, instruments, orders, and positions
- Real-time WebSocket/Push API client with state management
- Comprehensive TypeScript types with no `any` usage
- Exponential backoff and retry logic with full jitter
- Rate limiting with Retry-After header support
- Clock synchronization for handling server time drift
- Idempotency key support for safe retries
- Circuit breaker pattern for resilience
- Comprehensive error handling with detailed error types
- WebSocket connection state machine with auto-reconnection
- Automatic resubscription after WebSocket reconnection
- Heartbeat management with timeout detection
- Backpressure handling with bounded message queues
- Authentication support: Bearer token, HMAC, session-based, credentials
- Order management: market, limit, stop, OCO, bracket orders
- Position management with risk metrics
- Real-time market data streaming
- Portfolio monitoring and statistics
- Production-ready examples and documentation
- 90%+ test coverage with unit and integration tests
- TypeDoc API documentation
- GitHub Actions CI/CD pipeline

### Features
- **Production Ready**: Battle-tested patterns for enterprise applications
- **Type Safe**: Strict TypeScript with comprehensive interfaces
- **Reliable**: Robust error handling and connection management
- **Performant**: Optimized for high-frequency trading scenarios
- **Extensible**: Pluggable architecture for easy customization
- **Well Documented**: Comprehensive documentation and examples

### Dependencies
- Node.js 20+ support
- WebSocket (ws) for real-time connections
- Zod for runtime type validation
- Comprehensive development tooling (ESLint, Prettier, Vitest)

### Breaking Changes
- None (initial release)

### Migration Guide
- None (initial release)

---

## Template for Future Releases

### [Unreleased]

#### Added
#### Changed
#### Deprecated
#### Removed
#### Fixed
#### Security

---

### Release Notes Template

Each release should include:
- **Added**: New features
- **Changed**: Changes in existing functionality
- **Deprecated**: Soon-to-be removed features
- **Removed**: Removed features
- **Fixed**: Bug fixes
- **Security**: Vulnerability fixes