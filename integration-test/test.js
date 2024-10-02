#!/usr/bin/env zx
import path from 'path';
import 'zx/globals';

// Get the directory of the current script
const DIR = path.dirname(new URL(import.meta.url).pathname);

// Find all test.sh and test.js files in subfolders
const testFiles = await glob('*/test.{sh,js}', { cwd: DIR, ignore: 'node_modules/**' });

for (const testFile of testFiles.sort()) {
  const fullPath = path.join(DIR, testFile);
  const folderName = path.basename(path.dirname(testFile));
  
  console.log(`::group::${folderName} test ${argv._}`);
  
  if (testFile.endsWith('.sh')) {
    await $`bash ${fullPath} ${argv._}`.stdio('inherit', 'inherit', 'inherit');
  } else if (testFile.endsWith('.js')) {
    await $`zx ${fullPath} ${argv._}`.stdio('inherit', 'inherit', 'inherit');
  }
  
  console.log('::endgroup::');
  console.log();
}