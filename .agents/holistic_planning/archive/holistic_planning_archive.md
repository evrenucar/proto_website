# Holistic Planning Archive

This file contains resolved planning history and legacy diagrams from the original `holistic_planning.md`.

---

## Product Flow Diagram (Resolved)

```mermaid
flowchart TD
    A[User opens workspace] --> B{Entry surface}
    B --> C[Cosmoboard]
    B --> D[Markdown page]
    B --> E[Base / database view]

    C --> F[Add note]
    C --> G[Attach local file]
    C --> H[Embed website]
    C --> I[Reference markdown]
    C --> J[Reference database]
    C --> K[Later: embed app]

    D --> I
    D --> L[Embed cosmoboard preview]
    D --> M[Embed file viewer]
    D --> J

    E --> N[Query notes, boards, files]
    E --> O[Open item in board or markdown]

    C --> P[Export]
    D --> P
    E --> P

    P --> Q[Markdown / Canvas / Base]
    P --> R[Portable bundle]
    P --> S[GitHub recommendation / version flow]
```

## Architecture Layer Diagram (Resolved)

```mermaid
flowchart TD
    A[Host Shell] --> B[Cosmoboard Engine]
    A --> C[Markdown Engine]
    A --> D[Base / Database Layer]

    B --> E[Viewer Layer]
    C --> E
    D --> E

    B --> F[Entity Layer]
    C --> F
    D --> F

    B --> G[Persistence Layer]
    C --> G
    D --> G

    G --> H[Browser Draft]
    G --> I[Canonical Files]
    G --> J[Portable Bundle]
    G --> K[Optional GitHub Save]

    F --> L[Shared Notes]
    F --> M[Markdown Refs]
    F --> N[Media Refs]

    K --> O[Async Collaboration]
    O --> P[Later Realtime Collaboration]
```

## File Organization Class Diagram (Resolved)

```mermaid
classDiagram
    class BoardRegistry {
      +boards[]
      +getBoard(slug)
    }

    class CosmoboardFile {
      +slug
      +nodes[]
      +edges[]
      +viewport
    }

    class MarkdownFile {
      +path
      +frontmatter
      +body
    }

    class BaseFile {
      +path
      +views[]
      +filters
      +properties
    }

    class EntityRecord {
      +id
      +type
      +content
      +metadata
    }

    class AssetRecord {
      +id
      +path
      +mime
      +preview
    }

    class EmbedRecord {
      +id
      +url
      +provider
      +sandboxPolicy
      +snapshot
    }

    class AppSessionRecord {
      +id
      +appType
      +manifest
      +sessionState
    }

    BoardRegistry --> CosmoboardFile : registers
    CosmoboardFile --> EntityRecord : references
    EntityRecord --> MarkdownFile : may source from
    EntityRecord --> BaseFile : may query from
    EntityRecord --> AssetRecord : may attach
    EntityRecord --> EmbedRecord : may wrap
    EntityRecord --> AppSessionRecord : may restore
```

## Interchange Flow Diagram (Resolved)

```mermaid
flowchart LR
    A[Canonical board + markdown + bases + assets] --> B[Open in site]
    A --> C[Export to JSON Canvas]
    A --> D[Export to Markdown + assets]
    A --> E[Export to portable bundle]
    A --> F[Submit GitHub recommendation]
    G[Imported local files] --> A
    H[Imported markdown vault] --> A
    I[Imported canvas files] --> A
```

## Roadmap Flow Diagram (Resolved)

```mermaid
flowchart LR
    A[Phase 0 Demo Platform Framing] --> B[Phase 1 Cosmoboard Engine]
    B --> C[Phase 2 Markdown Integration]
    C --> D[Phase 3 Base / Database Layer]
    D --> E[Phase 4 File + Web Embed Layer]
    E --> F[Phase 5 GitHub Versioning]
    F --> G[Phase 6 Realtime Collaboration]
    G --> H[Phase 7 App Embeds]
    H --> I[Phase 8 Deep Portability]
```
