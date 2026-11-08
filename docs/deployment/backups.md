# Copias de seguridad

Scripts en [`infrastructure/backup`](../../infrastructure/backup). Sin servicios de pago: `pg_dump`,
cifrado con [age](https://age-encryption.org) y, si se quiere, copia a otro proveedor con `rclone`.

## Qué se guarda

| Archivo                       | Contenido                                            |
| ----------------------------- | ---------------------------------------------------- |
| `vtp-db-<fecha>.dump.age`     | La base de datos completa (`pg_dump -Fc`), cifrada   |
| `vtp-uploads-<fecha>.tar.age` | Los documentos KYC (volumen `api-uploads`), cifrados |

Se conservan **7 diarias, 4 semanales (domingo) y 6 mensuales (día 1)**. Los dos archivos deben
restaurarse juntos.

## Llaves (una sola vez, en tu computadora, no en el servidor)

```sh
age-keygen -o vtp-backup-key.txt          # LLAVE PRIVADA: guárdala fuera del servidor
age-keygen -y vtp-backup-key.txt > backup-recipients.txt   # llave pública
```

- Copia **solo** `backup-recipients.txt` al servidor (`/etc/vtp/backup-recipients.txt`, `chmod 600`).
- Guarda la llave privada en dos lugares seguros (gestor de contraseñas y una copia sin conexión).
  Sin ella las copias no se pueden abrir; con ella, cualquiera puede. Nunca en git.

## Copia nocturna en el servidor

```sh
sudo apt-get install -y age            # y rclone si se usa otro proveedor
sudo install -m 700 infrastructure/backup/backup.sh /usr/local/bin/vtp-backup
```

`/etc/cron.d/vtp-backup` (03:15 hora del servidor):

```cron
15 3 * * * root VTP_BACKUP_RECIPIENTS=/etc/vtp/backup-recipients.txt VTP_BACKUP_DIR=/var/backups/vtp /usr/local/bin/vtp-backup >> /var/log/vtp-backup.log 2>&1
```

Variables:

| Variable                   | Por defecto                                                              | Para qué                                               |
| -------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------ |
| `VTP_BACKUP_RECIPIENTS`    | — (obligatoria)                                                          | Archivo con la llave pública de age                    |
| `VTP_BACKUP_DIR`           | `/var/backups/vtp`                                                       | Dónde quedan las copias                                |
| `VTP_COMPOSE`              | `docker compose -f /opt/vtp/compose.yml --env-file /etc/vtp/compose.env` | Cómo llegar a los contenedores                         |
| `VTP_BACKUP_UPLOADS`       | `1`                                                                      | `0` para no copiar los documentos KYC                  |
| `VTP_BACKUP_RCLONE_REMOTE` | vacío                                                                    | Por ejemplo `b2:vtp-backups`: copia fuera del servidor |

Una copia que solo está en el mismo servidor no protege de perder el servidor: configura
`VTP_BACKUP_RCLONE_REMOTE` con otro proveedor (muchos tienen un plan gratuito o de centavos al
mes para pocos GB) o descarga las copias periódicamente.

## Prueba de restauración (cada mes)

En tu computadora (con Docker y la llave privada), con la copia más reciente:

```sh
infrastructure/backup/restore-check.sh vtp-db-<fecha>.dump.age vtp-backup-key.txt \
  vtp-uploads-<fecha>.tar.age
```

Restaura en un contenedor temporal (nunca en producción), muestra cuántos usuarios,
organizaciones, reservas, pagos y migraciones tiene, cuenta los documentos KYC y borra todo al
terminar. Termina con `Restore check OK.`; anota la fecha de la prueba.

## Restaurar de verdad

1. Detén la API (`docker compose ... stop api web`).
2. Descifra: `age -d -i vtp-backup-key.txt -o db.dump vtp-db-<fecha>.dump.age`.
3. Restaura sobre una base vacía:
   `docker compose ... exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner' < db.dump`.
4. Documentos: `age -d -i vtp-backup-key.txt vtp-uploads-<fecha>.tar.age | docker compose ... exec -T api tar -C /app/var/uploads -xf -`.
5. Arranca la API y revisa `/api/v1/health/ready`.

Si hay que restaurar por un incidente de seguridad, sigue también
[derechos e incidentes](../legal/derechos-e-incidentes.md).
