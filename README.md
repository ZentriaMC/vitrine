# vitrine

A schema browser for private protobuf/gRPC APIs, backed by an OCI registry.
Everything BSR gives you for browsing, none of the hosted registry.

## Pipeline

```
.proto -> buf build -> OCI artifact -> registry
                                          |
                                    vitrine pulls
                                          |
                          FileDescriptorSet -> normalizer -> IR -> UI
```

`buf` runs at build time only, in CI or from the justfile. The server never
shells out to it: the artifact already contains a descriptor set that was linted
and breaking-checked before it shipped, so re-deriving it per request would only
weaken the guarantee that what you see is what shipped.

| stage            | where                                        |
| ---------------- | -------------------------------------------- |
| sample protos    | `etc/fixtures/sample/`                       |
| artifact spec    | [docs/oci-artifact.md](docs/oci-artifact.md) |
| registry client  | `src/lib/server/registry.ts`                 |
| modules/versions | `src/lib/server/catalog.ts`                  |
| ingest + cache   | `src/lib/server/schema.ts`                   |
| normalizer       | `src/lib/normalize/`                         |
| IR types         | `src/lib/ir.ts`                              |
| UI               | `src/routes/`                                |

The protos under `etc/fixtures/` are fixtures, not vitrine's own schema. Each
fixture is a buf module in the ordinary repo layout: sources under `proto/`,
`buf.yaml` above it. The artifact ships rooted at the _module_ root instead, so
`etc/fixtures/sample/proto/zentria/…` on disk becomes `zentria/…` in the
tarball, matching the names inside the descriptor set. The two layouts
deliberately differ so the packaging is actually exercised rather than being
accidentally correct. `just build-schema other` works the moment you add
`etc/fixtures/other/`.

## Running

Dependencies come from Nix via direnv; `buf`, `oras`, `skopeo`, `just`, `node`
and `bun` all live in the dev shell. Docker is needed for the local registry.

```sh
direnv allow      # or: nix develop
bun install
just dev          # registry up, push the fixture as `dev`, then serve
```

## Deploying

`adapter-node`, so `bun run build` produces a plain Node server in `build/`:

```sh
bun run build
PORT=3000 VITRINE_REGISTRY=registry.internal:5000 node build
```

Nothing else is required at runtime. The server has exactly one non-framework
dependency (`@bufbuild/protobuf`) and never touches `child_process` or the
filesystem -- `buf`, `oras` and `skopeo` are build-time tools that live in the
justfile, not the request path. Put vitrine in front of a registry, set the
environment, and it works as-is.

Configuration is read from `process.env` at startup, not inlined at build, so
one image runs against any registry. An unreachable registry is reported rather
than thrown: `/` renders an explanatory panel, and a schema route answers 503
(as opposed to 404, which means the tag genuinely does not exist).

## Registry model

A vitrine registry holds nothing but schema artifacts, so every repository in it
is a module and every tag is a version. That is why discovery needs no config:
`_catalog` lists modules, `tags/list` lists versions.

`_catalog` is optional in the distribution spec -- registry:3 and Harbor
implement it, ghcr.io and Docker Hub do not. Set `VITRINE_REPO_PREFIX` to share
a registry with other content, and swap `catalog()` for a configured module list
if you ever move to one without it.

The cache has two halves with deliberately different rules:

- `tag -> digest` is mutable, so it carries a TTL (`VITRINE_TAG_TTL_MS`,
  default 30s). A version addressed by digest skips it entirely.
- `digest -> IR` is content-addressed, so it is kept until evicted by an LRU
  (`VITRINE_IR_CACHE`, default 32). Memory is the only bound; correctness is
  not at stake.

Because digests are addressable, `/s/sample/sha256:…` renders an exact schema
that can never drift -- useful for linking from CI.

| variable                             | default           |
| ------------------------------------ | ----------------- |
| `VITRINE_REGISTRY`                   | `localhost:5050`  |
| `VITRINE_REGISTRY_PLAIN_HTTP`        | auto for loopback |
| `VITRINE_REGISTRY_USERNAME/PASSWORD` | unset             |
| `VITRINE_REPO_PREFIX`                | empty             |

vitrine authenticates to the registry with its own credentials and shows
everything it can pull, which is the right model for a registry dedicated to
schemas. If you ever put partner-scoped modules in one registry, revisit this --
passing the viewer's token through would make the registry enforce visibility
instead of vitrine.

## What the normalizer does

The descriptor set is resolved but not _presentable_. The normalizer:

- **keys everything by FQN.** `zentria.vitrine.demo.v1.Fleet.Member` is the map
  key, the URL and the cross-link target. Nesting is flattened; `parent` records
  where a declaration came from so the UI can still draw a tree.
- **hides what protoc synthesized.** Map fields become real `map<k, v>` types
  rather than leaking a nested `LabelsEntry` message; proto3 `optional` becomes
  a flag rather than leaking a one-member oneof named `_description`.
- **reattaches comments.** Doc comments are not on descriptors -- they live in
  `SourceCodeInfo`, keyed by paths of field numbers into the
  FileDescriptorProto (`[4, 0, 2, 1]` = `message_type[0].field[1]`).
  `src/lib/normalize/comments.ts` walks the tree emitting those paths and joins
  on them, then re-keys the result by FQN so nothing else has to care.
- **decodes custom options.** `(pii) = true`, `(auth_scope) = "fleet:read"`.
  These only decode because the options `.proto` is part of the same build, so
  its extension descriptors are in the registry; anything unregistered stays an
  unknown field. Proprietary annotations are most of why an in-house browser
  beats a generic one.
- **builds the reverse index.** "Used by" -- every field, request and response
  that points at a type. This is the thing `protoc-gen-doc` does worst.

## Gotchas found the hard way

- `buf build` includes source info by default; `protoc` needs
  `--include_source_info`. Without it there are no comments at all.
- protobuf-es strips the `.proto` extension from `DescFile.name` (it derives
  codegen import paths from it). Use `file.proto.name` for the real path.
- An auto-layout `<table>` collapses a prose column to its longest word when
  sibling cells are `whitespace-nowrap`. Field lists are flex, not tables.
- registry:3 does not route `GET /v2/<repo>/referrers/<digest>`, even though it
  stores attachments fine. `oras discover` works because it falls back to the
  referrers tag schema -- an index parked at a `sha256-<hex>` tag. Any client
  needs both paths, and that tag has to be filtered out of the version list.

## Routes

| route                                  | what                                        |
| -------------------------------------- | ------------------------------------------- |
| `/`                                    | modules in the registry, with versions      |
| `/s/[module]/[version]`                | file overview, grouped by package           |
| `/s/[module]/[version]/t/[fqn]`        | a message, enum or service                  |
| `/s/[module]/[version]/m/[fqn]`        | a single RPC, request and response expanded |
| `/s/[module]/[version]/services`       | every RPC, filterable, groupable by option  |
| `/s/[module]/[version]/diff/[against]` | what changed between two versions           |

`[version]` accepts a tag or a `sha256:` digest. The sidebar version selector
keeps you on the same page across versions, so comparing one type between two
releases is one click -- landing on a 404 because the symbol was removed is a
useful answer too.

Links inside a schema go through `src/lib/links.ts`, which reads module and
version off the route rather than threading them through every component. That
module also maps well-known types to their protobuf.dev anchors -- `Timestamp`
and `Duration` link out rather than rendering as dead text, while
descriptor.proto types, documented elsewhere, stay unlinked.

The service index groups by service or by the value of any custom option found
on a method -- nothing hardcodes `auth_scope`, so whatever annotations a schema
carries become groupings for free. Service and method docs render inline, and
the filter searches them alongside names and option values.

Fields, enum values and methods carry their proto identifier as an anchor, so
`…/t/zentria.vitrine.demo.v1.Fleet#members` is a durable link to one field.
Identifiers go in verbatim rather than slugged: `owner_email` stays
`#owner_email`, because the anchor should be the thing a reader would type.

Request and response shapes expand inline, recursively, and enum-typed fields
expand to their values. `src/lib/server/related.ts` bounds how much of the
schema ships with a page: types reachable from the roots, breadth-first, to a
depth of three. Past that the UI falls back to a link.

## Diffs and attachments

`src/lib/diff.ts` diffs two normalized schemas. Both sides are FQN-keyed, so it
is a map diff plus a member pass: added, removed and modified nodes, then field,
enum value and method changes underneath, down to individual custom options.
Members match by name rather than number, so a rename reads as a removal plus an
addition while a renumber reads as one modified field -- names are what call
sites use. Documentation-only changes are detected and folded away behind a
toggle so real changes stay visible.

The differ deliberately does not decide what is _breaking_. `buf breaking`
already answered that in CI, and its report is attached to the artifact as an
OCI referrer, which vitrine renders on the version overview. Two sources of
truth for breaking-ness would be one too many.

```sh
just report v2.0.0 v1.10.0     # buf breaking, attached to the v2.0.0 artifact
```

The report is stored as JSON lines, so vitrine renders findings as rows -- rule
id, symbol, message -- rather than a blob of text. Each finding's `path:line` is
resolved back to the symbol that contains it, via source spans the normalizer
now records alongside comments, so a finding links straight into the browser. A
deletion finding has no symbol to link to in the newer version, by definition,
and falls back to the file and line.

Attachments are read back through the referrers API when a registry implements
it, and through the referrers tag schema when it does not -- see the gotcha
below.

## Shipping schemas

Schemas ship as OCI artifacts, defined in
[docs/oci-artifact.md](docs/oci-artifact.md). `dev/compose.yaml` runs the local
registry.

```sh
just registry-up                 # local registry on :5050
just push v1.0.0                 # build + push the sample fixture
just inspect v1.0.0              # manifest: layers, media types, provenance
just tags                        # versions of a module
just fetch v1.0.0                # pull it back out
just report v2.0.0 v1.10.0       # attach a buf breaking report as a referrer
just mirror v1.0.0 ghcr.io/org   # skopeo copy to a real registry
```

## Status

MVP. The demo protos under `etc/fixtures/sample/` are deliberately nasty --
`complex.proto` exists to exercise nested types, maps, oneofs, reserved ranges,
deprecation, custom options, cross-file and well-known-type references, and all
four RPC streaming modes.

Not done yet:

- **Nothing is signed.** The referrer plumbing is in place and would render a
  cosign attestation the same way it renders a breaking report, but signing
  needs keys and a policy for who verifies what.
- **Diffs compare within a module only.** Comparing across modules, or against
  an arbitrary digest typed into the UI, is not wired up.
- **Extensions are not rendered** as a declaration kind, so
  `annotations.proto` shows only its enum. The options it declares do show up
  wherever they are applied.
- **No auth in front.** The server shows everything in its registry to anyone
  who can reach it. Put oauth2-proxy or `tailscale serve` in front.
