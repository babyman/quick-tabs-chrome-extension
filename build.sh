#!/bin/bash

# source directory
src="quick-tabs"

die() { echo -e "\nError!" && waitkey && exit 1; }
waitkey() { read -n 1 -s -r -p "Press any key to continue"; }

echo "Cleaning the build directory..."
mkdir -p ./build || die
rm -rf ./build/* || die

echo -e "\nCopying '$src' to 'chrome'..."
cp -r ./$src/. ./build/chrome/ || die
echo "Zipping the Chrome build..."
cd ./build/chrome || die
rm -f manifest_firefox.json
zip -9 -q -r ../QuickTabs_Chrome_v`sed -n -E 's/^.*"version":\s*"(\S*)".*/\1/p' manifest.json`.zip *

cd ../..
echo -e "\nCopying '$src' to 'firefox'..."
cp -r ./$src/. ./build/firefox/ || die
echo "Zipping the Firefox build..."
cd ./build/firefox || die
mv -f manifest_firefox.json manifest.json
zip -9 -q -r ../QuickTabs_Firefox_v`sed -n -E 's/^.*"version":\s*"(\S*)".*/\1/p' manifest.json`.zip *

echo -e "\nDone!"
waitkey
