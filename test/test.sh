#!/usr/bin/env bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
echo $DIR
set -e

echo "::group::Simple test"
$DIR/simple/test.sh
echo "::endgroup::"
echo

echo "::group::OOM test"
$DIR/oom/test.sh 2>&1 | grep "ReportOOMFailure"
echo "::endgroup::"
echo

echo "::group::Server test"
bash $DIR/server/test.sh
echo "::endgroup::"
echo

echo "::group::Reload test"
bash $DIR/reload/test.sh
echo "::endgroup::"
echo