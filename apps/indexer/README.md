# @bharatchain/indexer

The Graph subgraph indexing BharatChain contract events into a queryable GraphQL API — the
authoritative read layer for the **public RBI→citizen ledger** and the admin/RBI dashboards.
Only on-chain commitments are indexed (addresses, amounts, nullifiers); **no PII**.

Runs against the self-hosted **Graph Node** in `infra/docker-compose.yml` (network name `hardhat`,
reaching the host Hardhat node via `host.docker.internal:8545`). Kafka handles the ETL/notification/
anomaly-detection side (see `docs/IMPLEMENTATION_PLAN.md` §6).

## Indexed entities

`Scheme`, `Vendor`, `Enrollment`, `Installment`, `Claim`, `Payment`, `Redemption`, and a singleton
`Stat` rollup (counts + totals for dashboards). See `schema.graphql`.

## Deploy (local)

Prereqs: the stack is up (`npm run infra:up`), a Hardhat node is running, contracts are deployed
(`npm run deploy:local -w @bharatchain/contracts`), and the backend has been seeded.

```bash
# from repo root
npm run subgraph:deploy -w @bharatchain/indexer
```

This regenerates `networks.json` + `abis/*.json` from `packages/contracts/deployments/<network>.json`
(`gen:config`), runs `graph codegen`, compiles the mappings, and deploys to the local Graph Node.

- GraphQL endpoint: <http://localhost:8000/subgraphs/name/bharatchain/welfare>
- Indexing status: <http://localhost:8030/graphql>

`subgraph.yaml` is committed with placeholder `0x0` addresses; `graph build --network hardhat` injects
the live addresses from the generated `networks.json` (which, like `generated/`, `build/`, and `abis/`,
is gitignored). Re-run `subgraph:deploy` after any redeploy of the contracts.

## Example query

```graphql
{
  stat(id: "global") { schemeCount totalClaimed totalPaid totalDelivered totalRedeemed }
  schemes(orderBy: id) { id name category fund disbursed active }
  payments { id amount delivered citizen vendor { id category } scheme { name } }
}
```
