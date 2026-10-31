# Menu and Service Catalog Separation — Implementation Notes

## What changed in application code

- Restaurant food/drink create and toggle actions operate on `menu_items` only; they no longer mirror records into `service_catalog` by name.
- The service catalog API lists non-`FOOD_BEVERAGE` entries only. New catalog writes are restricted to the categories represented by the existing MySQL enum: `HOUSEKEEPING`, `SERVICE`, `LAUNDRY`, `MINIBAR`, and `OTHER`.
- Service catalog UI uses descriptive subcategory text rather than reusing restaurant/department category IDs.
- Department product creation uses `restaurant_menu_list` and `restaurant_item_save`, with the real `menu_categories.id` as `category_id`.
- Department order-taking can identify whether the selected item comes from `menu_items` or `service_catalog`; the PHP API validates menu item availability and restaurant/bar type server-side.
- Guest portal request selection includes menu products from `menu_items` with a `menu:` ID prefix so menu item IDs cannot be confused with service catalog IDs. Legacy catalog food rows are left in place for traceability.
- Restaurant menu category creation and department/service category creation no longer automatically mirror or delete each other by matching category names.
- Fresh table creation in bootstrap and the supplied schema dump declare restrictive foreign keys for menu item categories and restaurant order-line references. Existing databases require the reviewed migration scripts; `CREATE TABLE IF NOT EXISTS` does not add constraints to existing tables.

## Data preservation

No live database connection was available and no migration was executed. The source dump is retained; the backfill script copies legacy `FOOD_BEVERAGE` products into `menu_items` only when a matching category/product is missing. It does not delete or overwrite legacy catalog rows or existing menu products. Use the preflight SQL and a restorable backup before applying any migration.

## Validation performed

- PHP syntax: `api-hotel/index.php`, `api-hotel/portal.php`, and `api-hotel/bootstrap.php` passed `php -l` after the changes.
- JavaScript syntax: `public/legacy/js/hotel_billing_department.js` and `public/legacy/js/hotel_billing_walkin.js` passed `node --check`.
- Database integration and live workflow tests were not run because no database server/credentials were provided.
- Next.js production build was not verified in this environment. The archive's native Next/SWC dependency may need reinstalling in the target development environment.

## Remaining operational work

1. Run the read-only preflight against a clone of the actual database.
2. Resolve any mixed-type category names or orphan references before adding constraints.
3. Run the additive backfill and relationship migrations against the clone, then verify menu counts and old order history.
4. Smoke-test restaurant menu CRUD, guest requests, service catalog CRUD, department order creation, billing, and RBAC before deploying.
5. Remove legacy `FOOD_BEVERAGE` rows from `service_catalog` only after manual reconciliation and explicit approval. This package intentionally does not do so.
