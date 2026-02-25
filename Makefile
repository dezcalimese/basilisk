.PHONY: backend frontend dev

backend:
	cd backend && uv run uvicorn app.api.main:app --reload

frontend:
	cd frontend && bun dev

dev:
	$(MAKE) backend & $(MAKE) frontend
