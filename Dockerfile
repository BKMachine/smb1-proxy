FROM dperson/samba:amd64 AS samba

RUN apk add --no-cache --update --upgrade \
    cifs-utils \
    python3 \
    supervisor \
    rsync \
    nodejs-current

# Docker Healthcheck
#COPY ./docker-healthcheck.py /docker-healthcheck.py
#HEALTHCHECK --interval=30s --timeout=15s --start-period=5s --retries=3 \
#    CMD ["python3", "-u", "/docker-healthcheck.py"]

FROM node:22-alpine AS nodejs
WORKDIR /app
COPY ./package.json package.json
RUN npm install --no-audit --no-fund --omit=dev

FROM samba
COPY ./docker-entrypoint.py /docker-entrypoint.py
COPY ./supervisord.conf /etc/supervisord.conf
COPY ./file-sync.js /file-sync.js
COPY --from=nodejs /app/node_modules /node_modules
ENTRYPOINT ["python3", "-u", "/docker-entrypoint.py"]
#CMD ["/bin/bash", "-c", "tail -f /dev/null"]

