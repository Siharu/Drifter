# DRIFTER Project Structure (UPDATED)

Fully organized TypeScript project for the DRIFTER browser-based Three.js exploration game set in the Another Sky universe.

**⚠️ Contains LATEST/UPDATED files** - All source files are the newest versions from your working directory.

## Directory Layout

```
├── docs/                          # Complete documentation
│   ├── ATMOSPHERESYSTEM_*.md      # AtmosphereSystem integration & reference
│   ├── RADIO_*.md                 # Radio broadcast system documentation
│   ├── DRIFTER_*.md               # DRIFTER game development guide
│   ├── RELAYSTATION7_*.md         # RelayStation7 location guide
│   ├── QUICKSTART.md              # Quick start guide
│   ├── GUIDE.md                   # Main development guide
│   ├── SUMMARY.md                 # Project summary
│   ├── CHANGELOG.md               # Version history
│   ├── INDEX.md                   # Documentation index
│   ├── LAYOUT_REFERENCE.md        # UI/Layout reference
│   └── drifter-project-complete.zip  # Reference archive (older version)
│
├── src/                           # All UPDATED source code
│   ├── main.ts                    # Application entry point
│   │
│   ├── core/                      # Engine & foundational systems
│   │   ├── Game.ts                # Main game class & loop
│   │   ├── Renderer.ts            # Three.js rendering engine
│   │   ├── CameraController.ts    # Camera management
│   │   ├── SceneManager.ts        # Scene initialization/lifecycle
│   │   └── LightingSystem.ts      # Dynamic lighting
│   │
│   ├── player/                    # Player-related systems
│   │   ├── Player.ts              # Player entity & state
│   │   ├── PlayerController.ts    # Player movement & actions
│   │   └── InputManager.ts        # Input handling (keyboard/mouse/gamepad)
│   │
│   ├── managers/                  # Resource & state management (NEW FOLDER)
│   │   ├── AssetManager.ts        # Asset loading & caching
│   │   └── SaveManager.ts         # Game state persistence
│   │
│   ├── world/                     # World objects & locations
│   │   ├── Interactable.ts        # Interactive object base class
│   │   └── RelayStation7.ts       # First playable location (UPDATED)
│   │
│   ├── systems/                   # Game systems & mechanics
│   │   ├── AtmosphereSystem.ts    # Weather, day/night, Fog of Medusa (UPDATED)
│   │   ├── RadioSystem.ts         # Radio broadcast reception (UPDATED)
│   │   ├── DiscoverySystem.ts     # Discovery & progression mechanics
│   │   ├── InteractionSystem.ts   # Interactive object handling
│   │   └── LogbookSystem.ts       # Player logbook data
│   │
│   └── ui/                        # UI components
│       ├── LogbookUI.ts           # Logbook display & interaction
│       ├── RadioNotificationPopup.ts  # Radio broadcast notifications
│       └── BroadcastArchive.ts    # Broadcast history UI
│
├── index.html                     # HTML entry point
├── package.json                   # Dependencies
├── package-lock.json              # Dependency lock
├── tsconfig.json                  # TypeScript config
├── vite.config.ts                 # Vite build config
└── ORGANIZATION.md                # This file
```

## Layer Architecture

### **Core Layer** (`src/core/`)
Foundation systems - everything depends on these:
- **Game.ts** - Main loop, initialization
- **Renderer.ts** - Three.js rendering pipeline
- **CameraController.ts** - Camera systems
- **SceneManager.ts** - Scene lifecycle management
- **LightingSystem.ts** - Lighting and visual atmosphere

### **Player Layer** (`src/player/`)
Player entity and control:
- **Player.ts** - Player data, inventory, state
- **PlayerController.ts** - Movement, animation, actions
- **InputManager.ts** - Raw input handling

### **Managers Layer** (`src/managers/`)
Resource and state management:
- **AssetManager.ts** - Asset loading and caching
- **SaveManager.ts** - Game save/load persistence

### **World Layer** (`src/world/`)
Interactive world objects and locations:
- **Interactable.ts** - Base class for interactive objects
- **RelayStation7.ts** - First playable location (UPDATED with latest changes)

### **Systems Layer** (`src/systems/`)
Gameplay systems managing core mechanics:
- **AtmosphereSystem.ts** - Environmental effects (weather, day/night, Fog of Medusa) ⭐ UPDATED
- **RadioSystem.ts** - Broadcast reception and mechanics ⭐ UPDATED
- **DiscoverySystem.ts** - Discovery mechanics and progression
- **InteractionSystem.ts** - Handles interactions with world objects
- **LogbookSystem.ts** - Player logbook mechanics

### **UI Layer** (`src/ui/`)
User interface components:
- **LogbookUI.ts** - Logbook panel
- **RadioNotificationPopup.ts** - Broadcast notifications
- **BroadcastArchive.ts** - Broadcast history display

## What's Different from the Nested Zip

| Component | Nested Zip | Current | Status |
|-----------|-----------|---------|--------|
| **AssetManager.ts** | ❌ Not included | ✅ Added | NEW |
| **SaveManager.ts** | ❌ Not included | ✅ Added | NEW |
| **AtmosphereSystem.ts** | 15.8 KB (Jun 22) | 22.4 KB (Jun 23) | ⭐ UPDATED |
| **RelayStation7.ts** | 16.1 KB (Jun 22) | 16.1 KB (Jun 23) | SAME SIZE |
| **RadioSystem.ts** | 6.9 KB (Jun 22) | 6.9 KB (Jun 23) | SAME SIZE |
| **Folder Structure** | `src/{core,player,systems,ui,world}` | `src/{core,player,managers,world,systems,ui}` | ✅ IMPROVED |

The **managers/** folder is new and contains resource management files that weren't in the older nested structure.

## Getting Started

### Prerequisites
```bash
npm install
```

### Development
```bash
npm run dev
```

### Build
```bash
npm run build
```

## Key Documentation

- **QUICKSTART.md** - Get up and running in minutes
- **GUIDE.md** - Deep dive into the codebase
- **ATMOSPHERESYSTEM_INTEGRATION.md** - Weather & environmental systems
- **RADIO_SYSTEMS_DELIVERABLE.txt** - Radio broadcast mechanics
- **DRIFTER_FIRST_PLAYABLE_GUIDE.md** - Game design & first location
- **LAYOUT_REFERENCE.md** - UI/UX reference

## Architecture Notes

### Separation of Concerns
- **Core** handles rendering and basic game loop
- **Player** encapsulates player-specific logic
- **Managers** handle resource loading and state persistence
- **World** manages interactive objects
- **Systems** implement gameplay mechanics
- **UI** displays information to the player

### Scalability Pattern
New features follow this pattern:
- Core systems in `src/systems/`
- New world objects in `src/world/`
- New UI in `src/ui/`
- New player mechanics in `src/player/`
- Resource management in `src/managers/`

### Data Flow
```
Input (InputManager)
  ↓
PlayerController (update position/state)
  ↓
InteractionSystem (handle nearby objects)
  ↓
Various Systems (RadioSystem, AtmosphereSystem, etc.)
  ↓
Managers (AssetManager, SaveManager)
  ↓
UI & Renderer (display to player)
```

## Recent Updates (From Loose Files)

✨ **AtmosphereSystem** - Expanded day/night cycles, weather patterns, Fog of Medusa integration  
✨ **RelayStation7** - Enhanced first playable location with updated interactions  
✨ **AssetManager** - New comprehensive asset loading & caching system  
✨ **SaveManager** - New game state persistence system  
✨ **RadioSystem** - Enhanced broadcast reception mechanics  

---

*Organized: June 23, 2026*  
*Files: Updated/Latest versions from loose directory structure*
