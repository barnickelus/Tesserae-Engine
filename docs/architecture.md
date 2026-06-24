# Architecture

> High-level technical design of Tesserae-Engine.

## Overview

_Describe the major subsystems and how data flows between them._

## Subsystems

### Rendering

_How frames are produced; relationship to `shaders/`._

### Resources & Assets

_How models, textures, and other data in `assets/` are loaded and managed._

### Core / Primitive System

_See [primitive-system.md](primitive-system.md)._

## Module Layout

| Directory   | Responsibility                          |
|-------------|------------------------------------------|
| `src/`      | Engine source code                       |
| `shaders/`  | GPU shader programs                      |
| `examples/` | Example scenes and demos                 |
| `assets/`   | Models, textures, and other resources    |

## Open Questions

- _Question 1_
