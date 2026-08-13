# Test fixtures

Real `buf build` output, not hand-built descriptors.

Every normalizer bug this project has hit was a specific of what protoc actually
emits -- synthesized map entry messages, the one-member oneof behind proto3
`optional`, SourceCodeInfo path encoding, `.proto` stripped from a name.
Constructing descriptors by hand in a test would encode the same
misunderstanding it is supposed to catch.

| file              | what                                 |
| ----------------- | ------------------------------------ |
| `sample-v1.binpb` | `etc/fixtures/sample` as of v1.10.0  |
| `sample-v2.binpb` | the same module after the v2 changes |

Two versions so the diff has something real to compare. Regenerate with
`just test-fixtures` after changing the sample protos.
