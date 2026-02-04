# Okta AI Simulator Roadmap

This document tracks planned features, improvements, and technical debt for the project.

## In Progress

## Planned

### Developer Experience

- [ ] Build a template/prompt for creating new grant type flows based on the `/agentic-token-exchange.html` approach. This should document the common patterns used across flows including:
  - Configuration panel with save/load functionality
  - Step-based flow UI with lock/unlock states
  - Token display with copy-to-clipboard buttons (`buildTokenCopyButtons`, `bindStep1CopyButtons`)
  - cURL command generation and display
  - "Explain cURL" modal - movable/resizable modal showing parameter origins and JWT structure
  - "regenerate curl" link to refresh cURL commands with new timestamps/values
  - Scope selector component
  - Dialog utilities (alert/prompt/confirm replacements)
  - Error handling and logging integration
- [ ] Build Configuration Builder
  - Allows CRUD of different fields (attributes) and field types
  - Use a consistent Known/previously used fields (attributes)
- [ ] Ability to "Create New Flow" either from a copy or from scratch.
  - From the dashboard, right justified '+' button on the header line of "Custom Flows" header
  - From the dashboard, add a "copy flow function" when long-pressing the Custom flows... it should toggle the tile header icon to a "copy flow"  

### Visualization

- [ ] Add visual progression diagrams to grant flows
  - Show the flow of tokens, requests, and responses between actors
  - Tag components with different actors (e.g., User, Browser, Native App, Authorization Server, Resource Server, Agent)
  - Represent various use cases through actor configurations
  - Highlight the current step in the visual diagram as users progress through flows

### UI Consistency

- [ ] Ensure button labels are consistent across all flows:
  - "View Logs" button in the stepper header
  - "Reset Steps" button in the stepper header
  - "View Log" link in each step (for step-specific log viewing)

### Architecture

- [ ] Design a JSON schema/object that could be used to declaratively build flow tiles. This should capture:
  - Display properties (title, subtitle, description, icon, category/tags)
  - Configuration fields (inputs, dropdowns, scope selectors, auth server pickers)
  - Steps definition (step number, actor, title, description, action button, cURL template)
  - Step orchestration (API endpoints, request/response handling, token storage, unlock conditions)
  - Token display configuration (which tokens to show, copy buttons, decode behavior)

## Backlog

## Completed

