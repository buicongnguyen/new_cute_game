# Borrowed models

All new temporary Zoo Garden models are stored in public/assets/models/borrowed/ and loaded by Cloudback role through BORROWED in src/world/borrowed.ts. Sizes are source-file kB (decimal); shared files are counted once toward the download budget. Large assets load only when needed.

| Role | Source file | Source node | Used in | Size (kB) | Status |
|---|---|---|---|---|---|

Phase 0 adds plumbing only; no new models or placeholders are borrowed. The existing house.glb furniture kit predates this registry and remains part of the core loader. Future art swaps preserve the role, update its mapping and this row, and set the status to replaced. Primitive placeholders must also have a documented role; add a matching mapping when introducing them.
