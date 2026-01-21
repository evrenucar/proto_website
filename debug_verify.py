from playwright.sync_api import sync_playwright
import os

def run_verification():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Listen to console
        page.on("console", lambda msg: print(f"Console log: {msg.text}"))
        page.on("pageerror", lambda exc: print(f"Page error: {exc}"))

        # 3. Verify Project View (Markdown)
        print("Visiting project_view.html?file=Bubble.md...")
        page.goto("http://localhost:8080/project_view.html?file=Bubble.md")

        # Wait for markdown content
        try:
            page.wait_for_selector("h1", timeout=5000)
            h1_text = page.locator("h1").first.inner_text()
            print(f"H1 text: {h1_text}")
        except Exception as e:
            print(f"Markdown render failed: {e}")

        browser.close()

if __name__ == "__main__":
    run_verification()
