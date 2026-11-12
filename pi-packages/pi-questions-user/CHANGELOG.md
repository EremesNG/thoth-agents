# Changelog

All notable changes to this Thoth package are documented here in Keep a Changelog style.

## [Unreleased]

### Fixed

- Avoid repeated markdown rendering when measuring questionnaires with shared option previews, while keeping measurement memory bounded.

## [0.6.0] - 2026-11-03

### Changed

- Require Pi 1.5.0 or newer and use injected expand-key hints that honor remapped or unbound actions.
- Size question panels to content, capped at 45% of terminal height without a baseline height floor; omit tabs/progress for single questions and clip hints to one row.
- Keep prompts pinned above options, prioritize option space over context, and bound context scrolling with Alt+arrows.
- Start narrow previews collapsed and toggle them with `p` outside editors, preserving the choice across tabs; wide previews remain visible.
- Limit tool `context` to 500 characters. Show longer proposals in response text before asking; internal question-service requests remain unrestricted.

### Fixed

- Return keyboard focus to the panel that was open before a question once the question closes.

## [0.5.3] - 2026-10-23

### Changed

- Shorten model-facing tool definitions without changing parameters.

## [0.5.2] - 2026-10-21

### Fixed

- Detach previous render components so question cards no longer retain a growing component chain.

## [0.5.1] - 2026-10-20

### Changed

- Replace per-key label descriptions with one shared description; keys, defaults, validation, and rendering are unchanged.

## [0.5.0] - 2026-10-18

### Added

- UI-only dock provider for pi-core's shared question service, with per-question free-text policy, abort cancellation, shutdown withdrawal, and truthful unavailable results for caller fallback.

### Fixed

- Wrap plain failure text and render SDK error results even when their details are empty.

## [0.4.0] - 2026-10-16

### Added

- Visible context-text priority and a context fallback field for question panels.

## [0.3.1] - 2026-10-13

### Changed

- Expose `ask_user_question` as model-only so codemode scripts cannot invoke it.

## [0.3.0] - 2026-10-10

### Added

- Questions docked in the shared editor slot with state-preserving Ctrl+] collapse and expansion.

### Fixed

- Preserve selection color on wrapped recommended options and render structured answers only once.

## [0.2.0] - 2026-10-08

### Changed

- Publish the extension as a built bundle.

### Fixed

- Keep question input focused over history/detail panel overlays.

## [0.1.0] - 2026-10-07

### Added

- First published root-owned `ask_user_question` extension with stable ids, single/multi/text/confirm questions, recommended options, previews, notes, localizable labels, and structured per-id answers.
- Framed questionnaire with adaptive height, tabs, windowed options, review screen, and Render KIT result cards.
- Sequential select/input fallback and truthful `no_ui` results without custom UI.

### Fixed

- Use preview-scroll keys that fullscreen Pi does not consume.
