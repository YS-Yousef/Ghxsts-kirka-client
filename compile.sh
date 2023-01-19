#!/bin/bash

# Requires: npm i -g bytenode

# Encode.
for jsfile in $(find . -type f -wholename './src/*.js' -not -wholename './src/recorder/*' -not -wholename './src/settings/*' -not -wholename './src/prompt/*' -not -wholename './src/features/plugins.js' -not -wholename './src/preload/settings.js' -not -wholename './src/plugins/*'); do
        echo "==> $jsfile"
        bytenode -c -e "$jsfile"
        file=${jsfile##*/}
        file=${file::-3}
        if [[ "$jsfile" == *"src/features"* ]]; then
                printf "require('bytenode'); module.exports = require('./${file}.jsc');" > $jsfile
        else
                printf "require('bytenode');\nrequire('./${file}.jsc');\n" > $jsfile
        fi
done

# Build.
npm run dist

# Remove junk.
find . -type f -name '*.jsc' -delete

# Revert files back to what they were
for jsfile in $(find . -type f -wholename './src/*.js'); do
        echo "==> $jsfile"
        git checkout $jsfile
done