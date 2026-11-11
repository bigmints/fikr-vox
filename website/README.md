# Fikr Vox website

`dist/` contains the Fikr Vox landing page, user guide, and screenshots of the podcast workspaces. The screenshots show Fikr Vox with a sample project. `main/` contains the shared Fikr marketing pages and assets.

## Preview locally

From the repository root, run the preview server and open [http://127.0.0.1:4322/vox/](http://127.0.0.1:4322/vox/).

```sh
node website/scripts/preview-main.cjs
```

Edit [the user guide source](dist/docs/index.html), then open [the local guide](http://127.0.0.1:4322/vox/docs/) to verify the changes. Keep section IDs stable so existing links still work. The preview server redirects backend routes to the live Fikr site. Run the routing tests before opening a pull request.

```sh
node --test website/cloudrun/vox-entry.test.cjs
```

## Publishing

The [Pages workflow](../.github/workflows/pages.yml) publishes `dist/` to GitHub Pages. Its entry points redirect to the corresponding paths on the [project website](https://fikr.one/vox/).

Production runs on Cloud Run. The router in [`cloudrun/`](cloudrun/) serves the marketing routes, shared assets, and `/vox/`. It proxies application routes and WebSocket upgrades to the upstream app. The deployment uses the existing application image as its base. Build the Dockerfile with `--target vox-update` to update the Vox pages on an image that already serves the shared marketing pages.

Before moving production traffic, verify the Vox landing page, user guide, screenshot assets, and upstream application routes on a no-traffic revision. Retain the prior revision for rollback.
