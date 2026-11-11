ARG FIKR_BASE_IMAGE
FROM ${FIKR_BASE_IMAGE} AS vox-update
RUN if [ -d /app/vox-public ]; then find /app/vox-public -mindepth 1 -delete; fi
COPY --chown=1001:1001 cloudrun/vox-entry.cjs /app/vox-entry.cjs
COPY --chown=1001:1001 dist/ /app/vox-public/
CMD ["node", "/app/vox-entry.cjs"]

FROM vox-update
COPY --chown=1001:1001 main/ /app/fikr-main/
