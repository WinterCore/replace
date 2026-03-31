#!/usr/bin/env bash
set -euo pipefail

if [ $# -lt 2 ]; then
    echo "Usage: $0 <year> <raw-data-folder>"
    echo "Example: $0 2023 /path/to/raw/2023"
    exit 1
fi

YEAR="$1"
INPUT_DATA_PATH="$2"

cd "$(dirname "$0")/preprocessor"

OUTPUT_DIR="../app/public/${YEAR}-data"

echo "Processing r/place ${YEAR} data from ${INPUT_DATA_PATH}"
echo "Output: ${OUTPUT_DIR}"

rm -rf tmp "$OUTPUT_DIR"

cargo run -r -- "$INPUT_DATA_PATH"

echo "Compressing bin files in ${OUTPUT_DIR}..."
find "$OUTPUT_DIR" -type f -name '*.bin' -print0 | xargs -0 -n 1 -P 20 gzip -k -9

echo "Done!"
