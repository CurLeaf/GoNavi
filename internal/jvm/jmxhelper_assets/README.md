`jmx-helper-runtime.jar` is the embedded runtime used by `internal/jvm/jmx_helper.go`.

Source of truth:
- `tools/jmx-helper/src/com/gonavi/jmxhelper/*.java`

Regenerate the jar after changing helper sources:

```bash
tmpdir="$(mktemp -d)"
classes="$tmpdir/classes"
mkdir -p "$classes"
javac --release 8 -Xlint:-options -encoding UTF-8 -d "$classes" tools/jmx-helper/src/com/gonavi/jmxhelper/*.java
jar --create --file internal/jvm/jmxhelper_assets/jmx-helper-runtime.jar -C "$classes" .
rm -rf "$tmpdir"
```
