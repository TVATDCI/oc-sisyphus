# Python Rules

> **Provenance:** Inspired by AGENTS (github.com/m3tam3re/AGENTS). Adapted for our workflow.

## Style
- Google-style docstrings (`Args:`, `Returns:`, `Raises:`)
- Type annotations everywhere (pyright strict mode)
- `ruff` for formatting, line-length 100
- No `from module import *` — explicit imports only

## Naming
| Construct | Convention |
|-----------|-------------|
| Variables | `snake_case` |
| Functions | `snake_case` |
| Classes | `PascalCase` |
| Constants | `UPPER_SNAKE` |
| Files | `snake_case.py` |
| Private | `_leading_underscore` |

## Error Handling
- Catch specific exceptions, never bare `except:`
- Log context in except block before re-raising
- Use `None` sentinel, not mutable defaults

## Idioms
- List comprehensions over `map()`/`filter()`
- Context managers (`with`) for resource cleanup
- Generators for large data sets
- F-strings for formatting: `f"Price: ${price:.2f}"`

## Data Validation
- Use Pydantic models for structured data
- Validate at boundaries, not deep in code

## State
- Avoid `global`
- Encapsulate state in classes
- Use dataclasses or Pydantic models for data containers

## Anti-Patterns
```python
# NEVER: bare except
try: risky() except: pass  # ❌
try: risky() except ValueError as e: log(e)  # ✅

# NEVER: mutable defaults
def append(item, items=[]): items.append(item)  # ❌
def append(item, items=None):  # ✅
    if items is None: items = []
    items.append(item)

# NEVER: star imports
from module import *  # ❌
from module import specific_function  # ✅
```
