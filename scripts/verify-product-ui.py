import json
import tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1600, "height": 1000}, device_scale_factor=1)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto('http://localhost:5173/#/lab')
    page.get_by_role('button', name='Product cache scenario', exact=True).click()
    page.get_by_role('heading', name='Two storefronts. One product catalogue.').wait_for()
    assert page.locator('.cnode').count() == 6
    for name in ['Frontend', 'API', 'Backend', 'DB (SQL database)']:
        assert page.get_by_role('button', name=name + ' $' + {'Frontend': '20', 'API': '80', 'Backend': '70', 'DB (SQL database)': '300'}[name], exact=True).count() == 1
    assert '60,000 / 100,000' in page.locator('.product-budget').inner_text()
    page.get_by_label('Second site reads / month', exact=True).fill('1500000')
    assert '110,000 / 100,000' in page.locator('.product-budget').inner_text()
    assert page.locator('.product-budget--over').count() == 1
    page.reload()
    assert page.get_by_label('Second site reads / month', exact=True).input_value() == '1500000'
    assert page.get_by_role('button', name='Undo', exact=True).is_disabled()
    page.get_by_label('Second site reads / month', exact=True).fill('500000')
    page.get_by_role('button', name='Undo', exact=True).click()
    assert page.get_by_label('Second site reads / month', exact=True).input_value() == '1500000'
    page.get_by_label('Second site reads / month', exact=True).fill('500000')
    page.get_by_role('button', name='Run chaos test', exact=True).click()
    assert 'single point of failure' in page.locator('.chaos').inner_text()
    with page.expect_download() as download_info:
        page.get_by_role('button', name='Export', exact=True).click()
    download_path = download_info.value.path()
    exported = json.loads(Path(download_path).read_text())
    assert exported['design']['scenario']['allowance'] == 100000
    page.get_by_role('combobox', name='Load a template').select_option('empty')
    assert page.locator('.product-scenario').count() == 0
    page.locator('input[type=file]').set_input_files(download_path)
    page.get_by_role('heading', name='Two storefronts. One product catalogue.').wait_for()
    assert page.locator('.cnode').count() == 6
    preview = Path(tempfile.gettempdir()) / 'system-design-shared-products-preview'
    preview.mkdir(exist_ok=True)
    page.screenshot(path=str(preview / 'desktop.png'), full_page=True)
    page.set_viewport_size({"width": 390, "height": 844})
    page.reload()
    page.get_by_role('heading', name='Two storefronts. One product catalogue.').wait_for()
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
    page.screenshot(path=str(preview / 'mobile.png'), full_page=True)
    page.set_viewport_size({"width": 1600, "height": 1000})
    page.get_by_role('combobox', name='Load a template').select_option('layers')
    assert page.locator('.cnode').count() == 5
    for name in ['Frontend $20', 'API $80', 'Backend $70', 'DB (SQL database) $300']:
        page.get_by_role('button', name=name, exact=True).click()
    assert page.locator('.cnode').count() == 9
    assert not errors, errors
    print('PASS browser: navigation, quota edits, reload, undo, chaos, export/import, desktop/mobile, layer template, palette additions, no JS errors')
    browser.close()
