# The Zentria proto schema artifact

An in-house OCI artifact type for shipping protobuf schemas to selected people
and organizations. No blessed media type has emerged for protobuf-in-OCI the way
Helm has one for charts, so this defines ours.

## Why OCI

Registries are infrastructure we already run, and they already solve the parts
that actually matter here: per-repository RBAC and robot accounts, immutable
content-addressed pulls, signing, replication, retention. Nothing new to
operate.

The one thing protobuf gets for free that Helm never did: **descriptor sets are
self-contained.** `buf build` flattens every import, including well-known types,
into a single blob. There is no dependency resolution step, so one module maps
cleanly onto one artifact.

## Layout

```
artifactType: application/vnd.zentria.protoschema.v1

layers:
  [0] application/vnd.zentria.protoschema.descriptorset.v1
      -> schema.binpb
  [1] application/vnd.zentria.protoschema.sources.v1.tar+gzip
      -> sources.tar.gz
```

Two layers because there are two audiences. The **descriptor set** is what
tooling consumes -- `grpcurl -protoset`, `buf curl --schema`, codegen, vitrine.
The **sources tarball** is for partners who want to run their own `buf lint` /
`buf breaking`, vendor the files, or read them. Both describe the same version.

Both are rooted at the **module root**, never at a repo or build directory:
package `zentria.vitrine.demo.v1` lives at `zentria/vitrine/demo/v1/` in the
tarball and under that exact name in the descriptor set.

That is not cosmetic. `FileDescriptorProto.name` _is_ the import path -- an
`import "zentria/vitrine/demo/v1/simple.proto"` only resolves because the
compiler's root is where `zentria/` begins. An artifact rooted anywhere else
disagrees with the protos it contains, and the consumer finds out when they try
to compile them.

Where the sources sit in the producing repo is irrelevant and must not leak.
`proto/…` on disk is the normal buf layout; the tarball is built with the module
root as its base. A minimal `buf.yaml` (`version: v2`, no policy) is written at
that root so the tarball is a usable module on arrival -- lint and breaking
rules are the consumer's choice, not ours to impose.

Source info is included in the descriptor set. Without it there are no doc
comments, which makes the artifact useless for anything human-facing.

Each layer also carries `org.opencontainers.image.title` set to its filename.
`oras push` adds this automatically and `oras pull` uses it to restore names on
disk, so the titles are load-bearing rather than decorative.

The config blob is `application/vnd.oci.empty.v1+json`. There is no useful
config for a schema, and an empty config is the OCI 1.1 convention for artifacts
that do not need one.

## Annotations

Standard OCI annotations carry provenance:

| annotation                          | value                           |
| ----------------------------------- | ------------------------------- |
| `org.opencontainers.image.source`   | repository URL                  |
| `org.opencontainers.image.revision` | git commit the build came from  |
| `org.opencontainers.image.version`  | schema version, same as the tag |
| `org.opencontainers.image.created`  | RFC 3339 build timestamp        |

Plus ours:

| annotation                        | value                                        |
| --------------------------------- | -------------------------------------------- |
| `ee.zentria.protoschema.module`   | module name, e.g. `sample`                   |
| `ee.zentria.protoschema.packages` | comma-separated proto packages in the module |

`packages` exists so a consumer can tell what a tag contains from
`oras manifest fetch` alone, without pulling the blob. Registries have no useful
discovery API, so anything that makes a manifest self-describing is worth the
two lines.

## Naming and versioning

```
<registry>/<org>/schemas/<module>:<version>
```

The tag is the schema version and nothing else. CI consumers pin by digest
(`@sha256:…`); humans use tags. The git revision lives in an annotation rather
than the tag, so a rebuild of the same schema version is detectable without
being addressable.

## Signing

`cosign sign` the pushed reference. Partners verify provenance without having to
trust the transport or the registry operator. This is the main reason to prefer
OCI over a signed URL on a bucket.

## Attaching reports

Referrers let artifacts hang off a schema artifact rather than being bundled
into it. Today that means the `buf breaking` report; signatures and SBOMs fit
the same slot.

```
artifactType: application/vnd.zentria.protoschema.breaking.v1
layer:        application/jsonl, `buf breaking --error-format=json` output
annotation:   ee.zentria.protoschema.against = <base version>
```

buf emits one JSON object per finding with `path`, `start_line`, `type` and
`message`, so nothing downstream scrapes prose. `type` is the rule id
(`FIELD_SAME_TYPE`, `MESSAGE_NO_DELETE`), which is what makes findings
groupable and filterable rather than a wall of text. The artifactType says what
the attachment is; the layer media type says how it is encoded, and only the
latter should change if the encoding does.

Written with `oras attach`, read back by vitrine and rendered on the version
overview. The report is generated once, where the release is cut, and never
re-derived -- the verdict shown is the verdict that gated the release.

Generate it by comparing the two **built descriptor sets**, not the two source
trees. `buf breaking gen/<module>/schema.binpb --against <base>.binpb` reports
paths exactly as they appear inside the artifact; pointing it at a directory
prefixes every path with the build directory and leaks the layout of whatever
machine cut the release.

Two ways to read attachments, and a client needs both. The OCI 1.1 referrers
API (`GET /v2/<repo>/referrers/<digest>`) is the good one, but registry:3 does
not route it despite storing attachments correctly. The spec's fallback is the
**referrers tag schema**: an image index parked at a tag named after the subject
digest with `:` replaced by `-`. That tag shows up in `tags/list`, so it also
has to be filtered out of the version list.

## Not solved by this

Distribution is not authoring. If one proto module imports another, OCI helps
the consumer and does nothing for the author -- that still needs vendoring or a
monorepo. Keeping one self-contained module per artifact sidesteps the problem
downstream only.
