.PHONY: build dev clean

build: ## Build production binary with embedded frontend
	cd web && ~/.bun/bin/bun run build
	~/.cargo/bin/cargo build --release -p panoptikon-server

dev: ## Run in development mode
	~/.cargo/bin/cargo run -p panoptikon-server

clean:
	~/.cargo/bin/cargo clean
	rm -rf web/.next
