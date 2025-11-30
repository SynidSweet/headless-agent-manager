# Frontend - Example Implementation

This is a reference implementation showing how to use the `@headless-agent-manager/client` module in a React application.

**Purpose**: Demonstrate best practices for integrating the module with proper separation of concerns.

---

## Architecture

This frontend follows a **clean separation of concerns**:

- **Module** (`@headless-agent-manager/client`) - Business logic, state management, WebSocket
- **App Hooks** (`src/hooks/`) - Convenience wrappers around module selectors
- **Components** (`src/components/`) - Pure presentation, no business logic
- **Store** (`src/store/`) - Module configuration and setup

See complete documentation in the file for full details.

---

**For complete usage guide, see the full README.md file.**
**For module documentation, see `packages/agent-manager-client/README.md`**

---

**Last Updated**: 2025-11-30
