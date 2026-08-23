# Examples

## Local PACS test (`docker-compose.yaml`)

Spin up a throwaway [Orthanc](https://www.orthanc-server.com/) PACS with the
DICOMweb plugin **and** the OrbiDICOM viewer, already wired together:

```bash
docker compose -f examples/docker-compose.yaml up --build
```

- **Viewer** → http://localhost:8080
- **Orthanc** → http://localhost:8042 (upload some DICOM studies here)

The viewer reaches Orthanc through its own `/dicom-web` (nginx reverse proxy →
`orthanc:8042/dicom-web`), so there's no CORS to configure. Upload a study to
Orthanc, copy its **Study Instance UID**, and paste it into the viewer's
"load from PACS" box, or drag local `.dcm`/`.zip`/`.nii` files in as usual.

> **Dev only.** Orthanc authentication is disabled and the image is unpinned for
> convenience. Pin a version and enable auth before relying on this.

For Kubernetes deployment (Helm chart, ingress, autoscaling, GHCR image), see
[../docs/deploy.md](../docs/deploy.md).
