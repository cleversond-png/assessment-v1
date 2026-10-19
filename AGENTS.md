# AGENTS.md

Diagnóstico técnico Microsoft 365 para pré-vendas. Uma App Registration multi-tenant coleta configuração e governança com consentimento administrativo. A coleta é somente leitura e não acessa conteúdo de e-mail, arquivo ou chat.

## Stack

- Node.js 20+
- Backend: Express 4
- Frontend: React 19 e Vite 8
- Dados do tenant: Microsoft Graph (aplicação, `client_credentials`)
- Saída: JSON em disco e PDF

## Estrutura

```
backend/src/          API Express, auth, collectors, scoring, PDF
frontend/src/         interface React
azure/                permissões da App Registration
.github/workflows/    azure.yml.disabled (não publica)
docs/                 controle do projeto e planos
```

Collectors ficam em `backend/src/collectors/`, um diretório por domínio: `baseline`, `entraId`, `sharePoint`, `governance`, `emailSecurity`, `teams`, `iaReadiness`.

## Comandos

Na raiz:

```sh
npm run install:all
npm run build
npm start
```

`npm start` sobe `node backend/src/server.js`. Em `NODE_ENV=production` o mesmo processo serve `frontend/dist`.

Backend (`backend/`):

```sh
npm start
npm run dev
```

Frontend (`frontend/`):

```sh
npm run dev
npm run build
npm run lint
npm run preview
```

Variáveis de ambiente: copie `backend/.env.example` para `backend/.env`. Não commite `.env`, resultados de assessment nem cadastro de empresas.
