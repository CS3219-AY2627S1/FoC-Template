# Supplier image references

Seeds store filenames in the existing `image_key` field; storage hosts belong
in frontend configuration. The CP1252 supplier CSV accepts optional `ImageKey`
and `ImageURL` columns. For example:

```csv
Name,Type,Building,Floor,Location Description,Latitude,Longitude,StartingTime,ClosingTime,ImageKey,ImageURL
Example,Food,COM2,1,,1.296,103.773,0900hrs,1700hrs,anna.webp,
```

Use a case-preserving filename starting with a letter or digit, containing only
ASCII letters, digits, `_`, `-`, and `.`, and a common image extension:
jpg/jpeg, png, webp, gif, avif, svg, bmp, ico, tif/tiff (any case). URLs, absolute
paths, separators, traversal (`..`), percent escapes, and control characters
are rejected. Surrounding spaces are trimmed; whitespace-only fields are absent.
The original CSV without ImageKey still works with its six exact GitHub URLs.
When both image fields are populated, the legacy URL must map to the same key;
unknown URLs and conflicts block the entire import. Leave both blank for
suppliers without a known image. NUS review files use the same fields and rules;
refreshes retain manually entered keys, and exports preserve review provenance.

Place assets in this directory using the exact filename and case. The six
existing JPEGs already match the baseline seed. Do not invent keys or download
new images for suppliers without known assets.

## Local Compose

After configuring `.env` as described in the root README:

```bash
docker compose --profile tools config --quiet
docker compose up -d supplier-images
docker compose up -d --build frontend-service
curl --fail -I http://localhost:8090/ANNA.jpeg
```

Nginx mounts `data/images` read-only, serves MIME types, returns 404 for missing
files, and disables directory listing. Compose defaults the frontend build
argument `NEXT_PUBLIC_SUPPLIER_IMAGE_BASE_URL` to `http://localhost:8090`.
If port 8090 is occupied, set both `SUPPLIER_IMAGE_PORT` and the matching base
URL in `.env`. `localhost` works only when the browser runs on the Docker host;
remote browsers need a browser-reachable hostname. Compose service names such
as `supplier-images` are not browser URLs.

## Frontend builds and CloudFront

`NEXT_PUBLIC_*` settings are compiled into browser JavaScript before `yarn build`.
Changing the base URL requires rebuilding and recreating the frontend; setting
only a runtime container environment variable has no effect. Trailing slashes
are handled consistently. Missing or failed images show the existing fallback.
Assets are fetched directly by the browser, without the Next.js image proxy.

For CloudFront, place the same filenames at your configured distribution path,
then set `NEXT_PUBLIC_SUPPLIER_IMAGE_BASE_URL=https://your-distribution.cloudfront.net`
(optionally including a path prefix) in `.env` and rebuild the frontend. For an
external Docker build, pass `--build-arg NEXT_PUBLIC_SUPPLIER_IMAGE_BASE_URL=...`.
For a host build, export that variable before `yarn build`. Without an override,
the Dockerfile and frontend retain the existing raw GitHub base URL. Local
Compose intentionally overrides that default with Nginx. No AWS build
configuration exists in this checkout; wire the same argument into the external
AWS build when available. Infrastructure provisioning is separate.

Changing seed files does not update existing database records. The importer
continues to skip existing UUIDs when immutable coordinates match, preserving
later edits and deletion state. If an existing image key changes, arrange a
reviewed manual database update to `supplier.image_key` using its manifest UUID;
do not delete, reseed, or alter the supplier identity. Changing only the storage
host requires frontend configuration and a rebuild, with no supplier row changes.
