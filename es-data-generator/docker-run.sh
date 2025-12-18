#!/bin/bash

# Elasticsearch Data Generator - Docker Helper Script

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored messages
print_message() {
    echo -e "${2}${1}${NC}"
}

# Function to check if Docker is running
check_docker() {
    if ! docker info > /dev/null 2>&1; then
        print_message "Error: Docker is not running. Please start Docker and try again." "$RED"
        exit 1
    fi
}

# Function to display usage
usage() {
    cat << EOF
${GREEN}Elasticsearch Data Generator - Docker Helper${NC}

${YELLOW}Usage:${NC}
    $0 [command]

${YELLOW}Commands:${NC}
    ${BLUE}prod${NC}        Build and run in production mode (port 8080)
    ${BLUE}dev${NC}         Build and run in development mode (port 5173)
    ${BLUE}stop${NC}        Stop running containers
    ${BLUE}restart${NC}     Restart containers
    ${BLUE}logs${NC}        View container logs
    ${BLUE}clean${NC}       Stop and remove containers, networks, and images
    ${BLUE}help${NC}        Show this help message

${YELLOW}Examples:${NC}
    $0 prod         # Start production server at http://localhost:8080
    $0 dev          # Start development server at http://localhost:5173
    $0 logs         # View logs from running container
    $0 stop         # Stop all containers

EOF
}

# Check if Docker is running
check_docker

# Main command handling
case "$1" in
    prod|production)
        print_message "🚀 Building and starting production server..." "$GREEN"
        docker-compose up -d --build
        print_message "✅ Production server is running at http://localhost:8080" "$GREEN"
        print_message "💡 Run '$0 logs' to view logs" "$BLUE"
        ;;
    
    dev|development)
        print_message "🚀 Building and starting development server..." "$GREEN"
        docker-compose -f docker-compose.dev.yml up -d --build
        print_message "✅ Development server is running at http://localhost:5173" "$GREEN"
        print_message "💡 Hot reload is enabled. Changes to src/ will reload automatically" "$BLUE"
        print_message "💡 Run '$0 logs' to view logs" "$BLUE"
        ;;
    
    stop)
        print_message "🛑 Stopping containers..." "$YELLOW"
        docker-compose down 2>/dev/null || true
        docker-compose -f docker-compose.dev.yml down 2>/dev/null || true
        print_message "✅ Containers stopped" "$GREEN"
        ;;
    
    restart)
        print_message "🔄 Restarting containers..." "$YELLOW"
        $0 stop
        sleep 2
        if [ -f ".dev_mode" ]; then
            $0 dev
        else
            $0 prod
        fi
        ;;
    
    logs)
        if docker ps | grep -q "es-data-generator"; then
            print_message "📋 Showing logs (Press Ctrl+C to exit)..." "$BLUE"
            docker-compose logs -f
        else
            print_message "❌ No running containers found" "$RED"
        fi
        ;;
    
    clean)
        print_message "🧹 Cleaning up..." "$YELLOW"
        docker-compose down --volumes --remove-orphans 2>/dev/null || true
        docker-compose -f docker-compose.dev.yml down --volumes --remove-orphans 2>/dev/null || true
        docker rmi es-data-generator:latest 2>/dev/null || true
        docker rmi es-data-generator-dev:latest 2>/dev/null || true
        print_message "✅ Cleanup complete" "$GREEN"
        ;;
    
    help|--help|-h)
        usage
        ;;
    
    *)
        print_message "❌ Invalid command: $1" "$RED"
        echo ""
        usage
        exit 1
        ;;
esac

