#[test_only]
module rentdelegate::rental_tests;

use rentdelegate::rental;

#[test]
fun metadata_version_is_one() {
    assert!(rental::metadata_version() == 1, 0);
}
