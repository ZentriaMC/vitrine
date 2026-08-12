default_fixture := "sample"
registry := env_var_or_default("VITRINE_REGISTRY", "localhost:5050")
source_url := "https://github.com/ZentriaMC/vitrine"

# Plain HTTP is only correct for dev/compose.yaml. Unset for a real registry.
insecure := env_var_or_default("VITRINE_REGISTRY_PLAIN_HTTP", "--plain-http")

# See docs/oci-artifact.md.
artifact_type := "application/vnd.zentria.protoschema.v1"
type_descriptorset := "application/vnd.zentria.protoschema.descriptorset.v1"
type_sources := "application/vnd.zentria.protoschema.sources.v1.tar+gzip"

default:
    @just --list

# Lint a fixture and build its descriptor set and source tarball.
build-schema fixture=default_fixture:
    buf lint etc/fixtures/{{ fixture }}
    mkdir -p gen/{{ fixture }}
    buf build etc/fixtures/{{ fixture }} -o gen/{{ fixture }}/schema.binpb
    # Rooted at the module root, not the repo root: entries must match the names
    # inside the descriptor set, which are what `import` statements resolve
    # against. Where the files sit on disk is nobody else's business.
    rm -rf gen/{{ fixture }}/stage
    mkdir -p gen/{{ fixture }}/stage
    cp -R etc/fixtures/{{ fixture }}/proto/. gen/{{ fixture }}/stage/
    printf 'version: v2\n' >gen/{{ fixture }}/stage/buf.yaml
    tar -czf gen/{{ fixture }}/sources.tar.gz -C gen/{{ fixture }}/stage .

# Push the fixture to the local registry as `dev`, then serve.
dev fixture=default_fixture: registry-up (push "dev" fixture)
    bun run dev

# Serve against whatever is already in the registry.
serve:
    bun run dev

build fixture=default_fixture: (build-schema fixture)
    bun run build

check:
    bun run check
    bun run lint

fmt:
    buf format -w etc/fixtures
    bun run format

# --- shipping -----------------------------------------------------------

# Start the local dev registry.
registry-up:
    docker compose -f dev/compose.yaml up -d

registry-down:
    docker compose -f dev/compose.yaml down

# Build a fixture and push it as an OCI artifact.
push version fixture=default_fixture: (build-schema fixture)
    #!/usr/bin/env bash
    set -euo pipefail
    # Lets a consumer see what a tag holds from the manifest alone, without
    # pulling the blob. Registries have no useful discovery API.
    packages=$(grep -rhE '^package ' --include='*.proto' etc/fixtures/{{ fixture }} \
        | sed 's/^package //; s/;$//' | sort -u | tr '\n' ',' | sed 's/,$//')
    cd gen/{{ fixture }}
    oras push {{ insecure }} \
        {{ registry }}/{{ fixture }}:{{ version }} \
        --artifact-type {{ artifact_type }} \
        --annotation "org.opencontainers.image.version={{ version }}" \
        --annotation "org.opencontainers.image.created=$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        --annotation "org.opencontainers.image.revision=$(git rev-parse --verify HEAD 2>/dev/null || echo unknown)" \
        --annotation "org.opencontainers.image.source={{ source_url }}" \
        --annotation "ee.zentria.protoschema.module={{ fixture }}" \
        --annotation "ee.zentria.protoschema.packages=$packages" \
        schema.binpb:{{ type_descriptorset }} \
        sources.tar.gz:{{ type_sources }}

# Pull an artifact back and print how to serve it.
fetch version fixture=default_fixture:
    #!/usr/bin/env bash
    set -euo pipefail
    dir="gen/pulled/{{ fixture }}/{{ version }}"
    rm -rf "$dir" && mkdir -p "$dir"
    oras pull {{ insecure }} -o "$dir" {{ registry }}/{{ fixture }}:{{ version }}
    echo
    echo "VITRINE_SCHEMA=$dir/schema.binpb just serve"

# List repositories in the registry.
ls:
    oras repo ls {{ insecure }} {{ registry }}

# List versions of a module.
tags fixture=default_fixture:
    oras repo tags {{ insecure }} {{ registry }}/{{ fixture }}

# Show an artifact's manifest: layers, media types, provenance annotations.
inspect version fixture=default_fixture:
    oras manifest fetch {{ insecure }} --pretty {{ registry }}/{{ fixture }}:{{ version }}

# Copy an artifact to another registry. skopeo authenticates to both ends.
mirror version dest fixture=default_fixture:
    skopeo copy --src-tls-verify=false \
        docker://{{ registry }}/{{ fixture }}:{{ version }} \
        docker://{{ dest }}/{{ fixture }}:{{ version }}

# Attach a `buf breaking` report for `version` against `base` as an OCI referrer.
#
# The report is generated once, in the same place the release is cut, and hangs
# off the artifact rather than being baked into it. vitrine renders it; nothing
# re-derives it.
report version base fixture=default_fixture:
    #!/usr/bin/env bash
    set -euo pipefail
    just fetch {{ base }} {{ fixture }} >/dev/null
    dir="gen/{{ fixture }}/reports"
    mkdir -p "$dir"
    out="$dir/breaking-{{ base }}.jsonl"
    # buf exits non-zero when it finds breaking changes; that is the finding,
    # not a failure, so capture the output either way.
    # JSON lines: rule id, file and position already parsed. No prose scraping.
    buf breaking gen/{{ fixture }}/schema.binpb --error-format=json \
        --against gen/pulled/{{ fixture }}/{{ base }}/schema.binpb >"$out" 2>&1 || true
    oras attach {{ insecure }} \
        --artifact-type application/vnd.zentria.protoschema.breaking.v1 \
        --annotation "ee.zentria.protoschema.against={{ base }}" \
        {{ registry }}/{{ fixture }}:{{ version }} \
        "$out:application/jsonl"
