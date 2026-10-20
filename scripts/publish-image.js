// Builds the plugin tools image from docker/ and pushes it to the registry named by QSYS_TOOLS_IMAGE, e.g. the
// Docker Hub repo <user>/qsys-plugin-tools:1.0.0. `npm run build` then pulls that image instead of building its own.
// Run `docker login` first. Give each published change a new tag: builds don't re-pull a tag they already have.
//
// Usage: npm run image:publish
import { spawnSync } from 'child_process';
import dotenv from 'dotenv';
dotenv.config({ quiet: true });

const image = process.env.QSYS_TOOLS_IMAGE;
if (!image) {
  console.log('Set QSYS_TOOLS_IMAGE in .env to the image to publish, e.g. <dockerhub-user>/qsys-plugin-tools:1.0.0');
  process.exit(1);
}

const docker = (...args) => {
  const result = spawnSync('docker', args, { stdio: 'inherit' });
  if (result.error) console.log('The docker command was not found');
  if (result.error || result.status !== 0) process.exit(1);
};

docker('build', '--platform', 'linux/amd64', '-t', image, 'docker');
docker('push', image);
console.log(`\nPublished ${image}`);
