import * as esbuild from 'esbuild';
import packageJson from './package.json' with { type: 'json' };

// When generating ESM output, if any of the bundled dependencies uses "require" in a way that cannot be replaced by
// esbuild, there will be an error at runtime because esbuild does not allow mixing imports and "require".
// better-sqlite3 has this problem because it uses "require" to import the native bindings. The workaround made is to
// externalize better-sqlite3. There are other options, see https://github.com/WiseLibs/better-sqlite3/issues/972.
const generateESM = true;
const outputFile = generateESM ? 'xikibot.mjs' : 'xikibot.cjs';

const prod = process.argv.length == 3 && process.argv[2] === '--prod';

console.log(`Generating ${outputFile} bundle (${prod ? 'PROD' : 'DEV'})…`);

const zigbee2mqttDist = {
  name: 'zigbee2mqtt-dist',
  setup(build) {
    build.onResolve({ filter: /^zigbee2mqtt\/(.+)$/ }, (args) => {
      return {
        path: args.path.replace('zigbee2mqtt/', '../../dist/') + (generateESM ? '.js' : ''),
        external: true,
      };
    });
  },
};

const externalizeBetterSqlite3 = {
  name: 'externalize-better-sqlite3',
  setup(build) {
    build.onResolve({ filter: /^better-sqlite3$/ }, () => {
      return {
        path: '../../better-sqlite3/lib/index.js',
        external: true,
      };
    });
  },
};

await esbuild.build({
  entryPoints: ['./src/main.ts'],
  bundle: true,
  outfile: generateESM ? 'dist/xikibot.mjs' : 'dist/xikibot.cjs',
  format: generateESM ? 'esm' : 'cjs',
  platform: 'node',
  target: ['node20'],
  tsconfig: 'tsconfig.build.json',
  external: [
    'debounce',
    'express-static-gzip',
    'bindings',
  ],
  plugins: [zigbee2mqttDist, externalizeBetterSqlite3],
  minify: prod,
  define: {
    __BUILD_VERSION__: JSON.stringify(packageJson.version),
    __BUILD_TIMESTAMP__: JSON.stringify(new Date().toISOString()),
  },
});
