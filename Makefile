.PHONY: build build-prod dev clean deploy

# Default build: web + Rust binary (correct order for rust-embed)
build: ## Build production binary with embedded frontend
	cd web && ~/.bun/bin/bun install --frozen-lockfile && ~/.bun/bin/bun run build
	~/.cargo/bin/cargo build --release -p panoptikon-server

# Alias — explicit name for CI/deploy scripts
build-prod: build ## Alias for 'build' — guaranteed correct order for production

dev: ## Run in development mode
	~/.cargo/bin/cargo run -p panoptikon-server

clean: ## Clean all build artifacts
	~/.cargo/bin/cargo clean
	rm -rf web/.next web/node_modules/.cache

deploy: build ## Build and deploy to LXC 115 (10.10.0.22)
	scp target/release/panoptikon-server root@10.10.0.22:/usr/local/bin/panoptikon-server.new
	ssh root@10.10.0.22 "systemctl stop panoptikon.service && mv /usr/local/bin/panoptikon-server.new /usr/local/bin/panoptikon-server && chmod 755 /usr/local/bin/panoptikon-server && systemctl start panoptikon.service"
	@echo "✅ Deployed to 10.10.0.22:8080"
