# Elasticsearch Data Generator

A powerful web-based tool for generating, importing, and managing test data in Elasticsearch. Built with React, TypeScript, and Vite.

## Features

- 🔧 **Schema Generator**: Generate realistic test data based on Elasticsearch mappings
- 📊 **Real-Time Mode**: Continuously insert data for live testing
- 📝 **Elasticsearch Editor**: Execute SQL queries against your Elasticsearch indices
- 🔄 **Update Operations**: Update documents by query or by ID
- 🗑️ **Delete Operations**: Delete documents by query with progress tracking
- 📤 **Import Data**: Bulk import from CSV/Excel files (including batch import)
- 📋 **Compare Schemas**: Compare mappings between different indices
- 📜 **Audit Trail**: Track all user actions with export capabilities

## Quick Start with Docker

### Production Mode (Recommended)

```bash
# Build and run using Docker Compose
docker-compose up -d

# Access the application at http://localhost:8080
```

Or using Docker directly:

```bash
# Build the image
docker build -t es-data-generator .

# Run the container
docker run -d -p 8080:80 --name es-data-generator es-data-generator

# Access the application at http://localhost:8080
```

### Development Mode (with Hot Reload)

```bash
# Build and run development server
docker-compose -f docker-compose.dev.yml up -d

# Access the application at http://localhost:5173
```

### Stop and Remove

```bash
# Stop and remove production container
docker-compose down

# Or for development
docker-compose -f docker-compose.dev.yml down

# Remove image
docker rmi es-data-generator
```

## Configuration

### Elasticsearch Connection

The application proxies Elasticsearch requests through `/es-proxy/`. By default, it connects to:

```
https://10.142.2.45:9200
```

To change the Elasticsearch URL:

**Option 1: Edit nginx.conf (Production)**
1. Open `nginx.conf`
2. Find the `location /es-proxy/` block
3. Update the `proxy_pass` URL:
   ```nginx
   proxy_pass https://YOUR_ES_HOST:YOUR_ES_PORT/;
   ```
4. Rebuild the Docker image

**Option 2: Edit vite.config.ts (Development)**
1. Open `vite.config.ts`
2. Update the proxy target:
   ```typescript
   target: 'https://YOUR_ES_HOST:YOUR_ES_PORT',
   ```

### Environment Variables

Set these in `docker-compose.yml`:

```yaml
environment:
  - ES_HOST=your-elasticsearch-host
  - ES_PORT=9200
  - ES_PROTOCOL=https
```

## Local Development (without Docker)

### Prerequisites

- Node.js 18+ and npm

### Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Access at http://localhost:5173
```

### Build for Production

```bash
# Build the application
npm run build

# Preview production build
npm run preview
```

## Usage Guide

### 1. Connections Tab
- Add Elasticsearch connections with authentication
- Test connectivity
- Manage multiple connections

### 2. Schema Generator Tab
- Select an index to analyze its mapping
- Add field rules for custom data generation
- Generate JSON preview
- Bulk insert test data
- Save and load configurations

### 3. Real-Time Mode Tab
- Configure continuous data insertion
- Set interval and document count
- Support for geo-path simulation (flights, vessels, vehicles)
- Start/stop real-time generation

### 4. Import Data Tab
- Upload CSV or Excel files (.csv, .xlsx, .xls)
- **Batch import**: Select multiple files for sequential processing
- Preview data before import
- Automatic data cleaning (empty values removed)
- Real-time progress tracking
- Detailed error reporting with export

### 5. Elasticsearch Editor Tab
- Execute SQL queries with pagination
- View results in table or JSON format
- Export to CSV
- Update documents by ID
- Example queries included

### 6. Update/Delete By Query Tabs
- Update documents matching a query
- Delete documents with progress tracking
- Painless script support
- Async operations with status monitoring

### 7. Compare Schemas Tab
- Compare mappings between indices
- View added, removed, and changed fields
- Export comparison results

### 8. Audit Tab
- View all user actions
- Filter by date range
- Export to JSON/CSV
- Clean up old logs (7 days or clear all)

## Docker Architecture

### Production (Multi-stage build)
1. **Builder stage**: Builds the Vite application
2. **Production stage**: Serves with Nginx (Alpine)
   - Gzip compression enabled
   - Static asset caching
   - SPA routing support
   - Elasticsearch proxy
   - Security headers

### Development
- Uses Node.js Alpine image
- Mounts source code for hot reload
- Exposes Vite dev server on port 5173
- Full TypeScript and HMR support

## Port Configuration

| Service | Port | Description |
|---------|------|-------------|
| Production | 8080 | Nginx serving built app |
| Development | 5173 | Vite dev server with HMR |

To change ports, edit `docker-compose.yml` or `docker-compose.dev.yml`:

```yaml
ports:
  - "YOUR_PORT:80"  # Production
  - "YOUR_PORT:5173"  # Development
```

## Troubleshooting

### Connection Issues

1. **Check Elasticsearch is accessible**:
   ```bash
   curl -k https://YOUR_ES_HOST:YOUR_ES_PORT/_cat/health
   ```

2. **View container logs**:
   ```bash
   docker logs es-data-generator
   ```

3. **Check proxy configuration**:
   - Production: Check `nginx.conf`
   - Development: Check `vite.config.ts`

### Build Issues

1. **Clear Docker cache**:
   ```bash
   docker build --no-cache -t es-data-generator .
   ```

2. **Check Node version**:
   ```bash
   docker run --rm node:20-alpine node --version
   ```

### Authentication Issues

If using authentication:
- Configure in the Connections tab
- Supports: API Key, Basic Auth, Bearer Token
- Credentials are stored in browser localStorage

## Technology Stack

- **Frontend**: React 18, TypeScript
- **Build Tool**: Vite
- **Styling**: CSS Modules
- **Data Generation**: Custom generator with realistic patterns
- **Excel Parsing**: XLSX library
- **Web Server (Production)**: Nginx Alpine
- **Container**: Docker, Docker Compose

## Security Notes

- ⚠️ SSL verification is disabled for Elasticsearch proxy (development)
- 🔒 In production, enable SSL verification in `nginx.conf`
- 🔐 Credentials stored in browser localStorage (not secure for production)
- 🛡️ Security headers enabled in production build

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test with Docker
5. Submit a pull request

## License

MIT License - See LICENSE file for details

## Support

For issues and questions:
- Check the Audit tab for error logs
- View browser console (F12) for detailed errors
- Export audit logs for debugging

---

**Built with ❤️ for Elasticsearch developers**
