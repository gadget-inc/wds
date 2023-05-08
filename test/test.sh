#!/usr/bin/env bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
echo $DIR
set -e

echo "::group::Simple test ${args}"
$DIR/simple/test.sh $args
echo "::endgroup::"
echo

echo "::group::OOM test ${args}"
$DIR/oom/test.sh $args
echo "::endgroup::"
echo

echo "::group::Server test ${args}"
bash $DIR/server/test.sh $args
echo "::endgroup::"
echo

echo "::group::Reload test ${args}"
bash $DIR/reload/test.sh $args
echo "::endgroup::"
echo