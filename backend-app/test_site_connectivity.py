#!/usr/bin/env python3
"""
Quick test script to verify Baltimore Housing site connectivity and PDF accessibility.
Run this to diagnose timeout issues before running the full scraper.
"""
import asyncio
from playwright.async_api import async_playwright

SEARCH_URL = "https://cels.baltimorehousing.org/Search_On_Map.aspx"

async def test_site_connectivity():
    print("🔍 Testing Baltimore Housing site connectivity...\n")
    
    async with async_playwright() as p:
        print("1. Launching browser...")
        browser = await p.chromium.launch(headless=True)
        
        print("2. Creating context...")
        context = await browser.new_context(
            accept_downloads=True,
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            viewport={"width": 1440, "height": 900}
        )
        
        page = await context.new_page()
        
        print(f"3. Navigating to {SEARCH_URL}...")
        try:
            response = await page.goto(SEARCH_URL, timeout=60000)
            print(f"   ✓ Response status: {response.status}")
            print(f"   ✓ URL loaded: {page.url}")
        except Exception as e:
            print(f"   ✗ Failed to load page: {e}")
            await browser.close()
            return
        
        print("\n4. Waiting for page to load...")
        try:
            await page.wait_for_load_state("domcontentloaded", timeout=30000)
            print("   ✓ Page loaded successfully")
        except Exception as e:
            print(f"   ✗ Page load timeout: {e}")
        
        print("\n5. Checking for select elements...")
        try:
            selects = page.locator("select")
            count = await selects.count()
            print(f"   ✓ Found {count} select elements")
            
            if count > 0:
                print("\n6. Examining first few selects...")
                for i in range(min(3, count)):
                    sel = selects.nth(i)
                    try:
                        opts = await sel.evaluate("(el) => el.options.length")
                        visible = await sel.is_visible()
                        print(f"   - Select {i+1}: {opts} options, visible={visible}")
                    except Exception as e:
                        print(f"   - Select {i+1}: Error - {e}")
        except Exception as e:
            print(f"   ✗ Error checking selects: {e}")
        
        print("\n7. Looking for neighborhood-related elements...")
        try:
            # Try to find neighborhood label
            for trigger in ["By Neighborhood", "Neighborhood"]:
                locator = page.locator(f"text={trigger}")
                if await locator.count() > 0:
                    print(f"   ✓ Found '{trigger}' label")
                    break
            else:
                print("   ⚠ No neighborhood label found")
        except Exception as e:
            print(f"   ✗ Error: {e}")
        
        print("\n8. Checking for Search button...")
        try:
            search_btn = page.locator("button:has-text('Search'), input[type=submit][value*='Search']")
            if await search_btn.count() > 0:
                print(f"   ✓ Found {await search_btn.count()} search button(s)")
            else:
                print("   ⚠ No search button found")
        except Exception as e:
            print(f"   ✗ Error: {e}")
        
        print("\n9. Taking screenshot for visual inspection...")
        try:
            await page.screenshot(path="site_test_screenshot.png")
            print("   ✓ Screenshot saved as: site_test_screenshot.png")
        except Exception as e:
            print(f"   ✗ Screenshot failed: {e}")
        
        print("\n10. Testing network speed with a simple request...")
        try:
            import time
            start = time.time()
            await context.request.get(SEARCH_URL, timeout=30000)
            elapsed = time.time() - start
            print(f"   ✓ Request completed in {elapsed:.2f} seconds")
            if elapsed > 10:
                print("   ⚠ WARNING: Very slow response time!")
        except Exception as e:
            print(f"   ✗ Request failed: {e}")
        
        await browser.close()
        
        print("\n" + "="*60)
        print("SUMMARY")
        print("="*60)
        print("✓ If all checks passed, the site is accessible")
        print("⚠ If you see warnings, there may be issues with site structure")
        print("✗ If you see errors, check your network/firewall settings")
        print("\nNext step: Try running the scraper with --headed flag to watch it in action")
        print("="*60)

if __name__ == "__main__":
    try:
        asyncio.run(test_site_connectivity())
    except KeyboardInterrupt:
        print("\n\nTest interrupted by user")
    except Exception as e:
        print(f"\n\n✗ FATAL ERROR: {e}")
        import traceback
        traceback.print_exc()

