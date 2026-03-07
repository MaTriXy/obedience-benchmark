# Obedience Benchmark Plugin — Process Diagram

```mermaid
flowchart TD
    subgraph P1["Phase 1: Architecture & Design"]
        R1[Research Existing Benchmarks]
        R2[Research Plugin Conventions]
        R3[Research YAML Schema]
        R4[Research Docker Runner]
        R1 & R2 & R3 & R4 --> AD[Architecture Design]
        AD --> BP1{Breakpoint: Review Architecture}
    end

    subgraph P2["Phase 2: Plugin Scaffold & Infrastructure"]
        BP1 --> SC[Plugin Scaffold]
        SC --> YS[YAML Task Schema]
        SC --> ST[Shared Types]
        SC --> LC[Log Collector]
        YS & ST & LC --> SV[Scaffold Verification]
    end

    subgraph P3["Phase 3: Skill Implementation"]
        SV --> CM[Catalog Manager]
        CM --> BCC[Benchmark Case Creator]
        CM --> TCP[Test Case Preparer]
        BCC & TCP --> CR[Candidate Runner]
        LC -.-> CR
        CR --> JU[Judge]
        JU --> RG[Report Generator]
        RG --> BM[Benchmarker Orchestrator]
        BM --> BP2{Breakpoint: Review Skills}
    end

    subgraph P4["Phase 4: Seed Catalog"]
        BP2 --> SMK[Smoke Test Tasks x3]
        BP2 --> FBT[Full Benchmark Tasks x7]
        SMK & FBT --> CV[Validate Catalog]
    end

    subgraph P5["Phase 5: Integration & E2E"]
        CV --> IW[Integration Wiring]
        IW --> E2E[E2E Smoke Test]
        E2E --> QG{Quality Gate}
        QG -->|FAIL| FIX[Fix Issues]
        FIX --> E2E2[Re-run Smoke Test]
        E2E2 --> QG2{Quality Gate}
        QG2 -->|FAIL, max 3x| BP3{Breakpoint: Manual Review}
        QG -->|PASS| P6START[ ]
        QG2 -->|PASS| P6START
    end

    subgraph P6["Phase 6: Documentation & Final Review"]
        P6START --> RM[Plugin README]
        P6START --> CG[Contributing Guide]
        RM & CG --> FR[Final Review]
        FR --> BP4{Breakpoint: Final Approval}
    end

    style P1 fill:#e8f4f8,stroke:#2196F3
    style P2 fill:#e8f8e8,stroke:#4CAF50
    style P3 fill:#fff8e1,stroke:#FF9800
    style P4 fill:#fce4ec,stroke:#E91E63
    style P5 fill:#f3e5f5,stroke:#9C27B0
    style P6 fill:#e0f2f1,stroke:#009688
```

## Parallel Execution Map

| Phase | Parallel Groups | Sequential Dependencies |
|-------|----------------|------------------------|
| 1 | R1, R2, R3, R4 (all parallel) | All research -> Architecture Design |
| 2 | YAML Schema, Shared Types, Log Collector (parallel) | Scaffold -> parallel group -> Verification |
| 3 | Case Creator + Test Preparer (parallel) | Catalog Mgr -> parallel -> Runner -> Judge -> Report -> Benchmarker |
| 4 | Smoke Tests + Full Tasks (parallel) | Both -> Validate |
| 5 | - | Wiring -> E2E -> Quality Gate (-> fix loop if needed) |
| 6 | README + Contributing (parallel) | Both -> Final Review |

## Breakpoints (4 total)

1. **Architecture Review** — after Phase 1, before implementation begins
2. **Skills Review** — after all 7 skills built, before seeding catalog
3. **Quality Gate Failure** — only if fix loop exhausts 3 iterations
4. **Final Approval** — before marking the run complete
