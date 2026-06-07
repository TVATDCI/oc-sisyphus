# Keyboard Shortcuts Reference

Complete reference for OpenCode keyboard shortcuts.

## Leader Key

The leader key (`Ctrl+X` by default) prefixes most shortcuts to avoid terminal conflicts.

**To use:** Press `Ctrl+X`, release, then press the action key.

Example: `Ctrl+X` → `N` creates a new session.

### Disabling the Leader Key

Not recommended, but possible in `tui.json`:
```json
{
  "keybinds": {
    "leader": "none"
  }
}
```

---

## Session Controls

| Shortcut | Action |
|----------|--------|
| `Escape` | Interrupt current operation |
| `<leader>C` | Compact session (collapse context) |
| `<leader>U` | Undo last message |
| `<leader>R` | Redo message |
| `<leader>S` | Share session |
| `<leader>X` | Export to Markdown |
| `<leader>G` | Session timeline |

---

## Navigation

| Shortcut | Action |
|----------|--------|
| `PageUp` | Page up |
| `PageDown` | Page down |
| `Ctrl+Alt+B` | Page up (alternative) |
| `Ctrl+Alt+F` | Page down (alternative) |
| `Ctrl+Alt+U` | Half page up |
| `Ctrl+Alt+D` | Half page down |
| `Home` | Jump to top |
| `End` | Jump to bottom |
| `Ctrl+G` | Jump to first message |
| `Ctrl+Alt+G` | Jump to last message |

---

## Input Editing (Emacs-style)

These work in the input field for composing messages.

### Movement

| Shortcut | Action |
|----------|--------|
| `Ctrl+A` | Start of line |
| `Ctrl+E` | End of line |
| `Ctrl+B` | Back one character |
| `Ctrl+F` | Forward one character |
| `Alt+B` | Back one word |
| `Alt+F` | Forward one word |
| `←` | Back one character |
| `→` | Forward one character |
| `Ctrl+←` | Back one word |
| `Ctrl+→` | Forward one word |

### Deletion

| Shortcut | Action |
|----------|--------|
| `Ctrl+D` | Delete character under cursor |
| `Ctrl+K` | Delete to end of line |
| `Ctrl+U` | Delete to start of line |
| `Ctrl+W` | Delete previous word |
| `Ctrl+Backspace` | Delete previous word (alt) |
| `Alt+D` | Delete next word |
| `Alt+Delete` | Delete next word (alt) |
| `Backspace` | Delete previous character |

### Selection

| Shortcut | Action |
|----------|--------|
| `Shift+←` | Select previous character |
| `Shift+→` | Select next character |
| `Shift+Home` | Select to line start |
| `Shift+End` | Select to line end |

### Other

| Shortcut | Action |
|----------|--------|
| `Ctrl+J` | New line in input |
| `Shift+Enter` | New line in input |
| `Ctrl+V` | Paste |
| `Ctrl+-` | Undo |
| `Ctrl+.` | Redo |
| `Ctrl+T` | Transpose characters |

---

## Model & Agent Switching

| Shortcut | Action |
|----------|--------|
| `F2` | Cycle to next recent model |
| `Shift+F2` | Cycle to previous recent model |
| `Ctrl+T` | Cycle model variant |
| `Tab` | Cycle agent forward |
| `Shift+Tab` | Cycle agent backward |
| `<leader>A` | Open agent picker |
| `<leader>M` | Open model picker |

---

## Subagent Navigation

When working with subagents (parallel task execution):

| Shortcut | Action |
|----------|--------|
| `<leader>↓` | Enter subagent session |
| `→` | Cycle to next subagent |
| `←` | Cycle to previous subagent |
| `↑` | Return to parent session |

---

## UI Controls

| Shortcut | Action |
|----------|--------|
| `<leader>E` | Open external editor |
| `<leader>T` | Theme picker |
| `<leader>B` | Toggle sidebar |
| `<leader>H` | Toggle tips |
| `<leader>Y` | Copy messages |
| `Ctrl+P` | Command palette |
| `Ctrl+G` | Cancel popover |

---

## Terminal Navigation

| Shortcut | Action |
|----------|--------|
| `Ctrl+Z` | Suspend terminal |
| `Ctrl+C` | Quit (when not in input) |

---

## Keybind Configuration

Customize shortcuts in `tui.json`:

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "keybinds": {
    "session_new": "ctrl+n",
    "session_compact": "none",
    "input_newline": "ctrl+enter"
  }
}
```

### Key Syntax

- Multiple keys: comma-separated (`"ctrl+g,home"`)
- Leader prefix: `<leader>` prefix
- Modifiers: `ctrl`, `alt`, `shift`, `meta`, `super`
- Disable: `"none"`

---

## Shift+Enter Note

Some terminals don't send `Shift+Enter` by default. If it doesn't work:

### Windows Terminal

Add to `settings.json`:
```json
{
  "actions": [
    {
      "command": {
        "action": "sendInput",
        "input": "\u001b[13;2u"
      },
      "id": "User.sendInput.ShiftEnterCustom"
    }
  ]
}
```

### Kitty

Add to `kitty.conf`:
```
map shift+enter send_text all \x1b[13;2u
```

### iTerm2

Enable in Preferences → Profiles → Keys → Load Preset → "Natural Text Editing"
