# CI security model

The root workflows are deliberately split by trust level:

- `ci.yml` runs on pull requests and pushes with read-only repository access.
- `pages.yml` publishes only from `main` or an explicit manual dispatch and
  receives Pages write plus OIDC permissions only for that publication job.
- `worker-deploy.yml` is manual-only and uses the protected
  `cloudflare-production` environment for its credential.

## Controls

- No workflow runs production deployment for a pull request.
- No secret is interpolated into a command line, artifact, or frontend bundle.
- Workflow permissions are explicit and minimal.
- Concurrency prevents stale deployments from overtaking current ones.
- Job and command timeouts limit hung work.
- The Pages API URL is validated as HTTPS before it enters the artifact.
- Worker and D1 deployment are separate so a frontend release cannot silently
  mutate backend data.

## Maintenance

Keep third-party action references on reviewed major versions and update them
through a reviewed dependency-maintenance change. When repository policy allows
it, pin action references to verified commit SHAs and use Dependabot or an
equivalent review process to refresh them. Never accept an action update that
introduces write permissions or secret access without a threat-model review.
