# Tesserae-Engine

A real-time graphics/rendering engine.

## Repository Structure

```
Tesserae-Engine/
├── README.md                 # This file
├── docs/                     # Project documentation
│   ├── vision.md             # What the engine is and why it exists
│   ├── architecture.md       # High-level technical architecture
│   ├── roadmap.md            # Planned milestones and features
│   ├── primitive-system.md   # Design of the core primitive system
│   ├── face-plate-system.md  # Face-plate system design
│   ├── style-packs.md        # Style-pack system design
│   ├── tessera-object-model.md # The Tessera primitive and its enums
│   └── continuous-abstraction.md # Abstraction slider (sculpture ↔ representation)
├── src/                      # Engine source code
│   ├── core/                 # Core types (Tessera + enums)
│   └── geometry/             # Surface sampling → Tessera reconstruction
├── shaders/                  # GPU shader programs
├── examples/                 # Example scenes and demos
│   ├── primitive-cloud.html  # GPU-instanced tesserae perf benchmark
│   ├── glb-sampler.html      # GLB → surface tesserae (form validation)
│   ├── tessera-avatar.html   # Animated GLB → bone-skinned tesserae
│   ├── semantic-tesserae.html # Region-based semantic sizing experiment
│   └── tessera-occupancy.html # Adaptive sparse-voxel tesserae with opacity
└── assets/                   # Models, textures, and other resources
```

## Documentation

- [Vision](docs/vision.md)
- [Architecture](docs/architecture.md)
- [Roadmap](docs/roadmap.md)
- [Primitive System](docs/primitive-system.md)
- [Face-Plate System](docs/face-plate-system.md)
- [Style Packs](docs/style-packs.md)
- [Tessera Object Model](docs/tessera-object-model.md)
- [Continuous Abstraction](docs/continuous-abstraction.md)

## Getting Started

_Coming soon._
