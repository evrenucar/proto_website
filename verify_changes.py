from playwright.sync_api import sync_playwright
import os

def run_verification():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # 1. Verify Projects Page
        print("Visiting projects.html...")
        page.goto("http://localhost:8080/projects.html")
        page.wait_for_selector(".grid.projects")

        # Take screenshot of projects
        os.makedirs("/home/jules/verification", exist_ok=True)
        page.screenshot(path="/home/jules/verification/projects.png")
        print("Projects page screenshot saved.")

        # 2. Verify Mobile Menu Logic (on desktop size first, check it's hidden/sidebar visible)
        # Desktop: Sidebar should be visible
        sidebar = page.locator("#sidenav_menu")
        if sidebar.is_visible():
            print("Sidebar is visible on desktop.")
        else:
            print("Sidebar is NOT visible on desktop (Error).")

        # Mobile size
        page.set_viewport_size({"width": 375, "height": 667})
        print("Resized to mobile.")
        # Sidebar should be hidden
        # Note: Playwright is_visible checks distinct visibility.
        # But our CSS hides it with display:none.
        if not sidebar.is_visible():
            print("Sidebar is hidden on mobile.")
        else:
             print("Sidebar is visible on mobile (Error).")

        # Click hamburger
        burger = page.locator(".toggle_menu")
        burger.click()
        # Wait for class change or visibility
        # Sidebar should become visible (display: block via .open)
        # We need to wait a bit or check class
        page.wait_for_selector(".sidenav.open")
        if sidebar.is_visible():
            print("Sidebar is visible after click.")
        else:
            print("Sidebar is NOT visible after click (Error).")

        page.screenshot(path="/home/jules/verification/mobile_menu.png")


        # 3. Verify Project View (Markdown)
        print("Visiting project_view.html?file=Bubble.md...")
        page.goto("http://localhost:8080/project_view.html?file=Bubble.md")

        # Wait for markdown content
        try:
            page.wait_for_selector("h1", timeout=5000)
            h1_text = page.locator("h1").first.inner_text()
            print(f"H1 text: {h1_text}")
            if "Bubble Project" in h1_text:
                print("Markdown rendered correctly.")
            else:
                print("Markdown rendered but title incorrect.")
        except Exception as e:
            print(f"Markdown render failed: {e}")

        page.screenshot(path="/home/jules/verification/project_view.png")

        browser.close()

if __name__ == "__main__":
    run_verification()
