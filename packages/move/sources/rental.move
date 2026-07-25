/// Minimal RentDelegate module skeleton. Core objects land in RD-004.
module rentdelegate::rental;

const METADATA_VERSION: u64 = 1;

public fun metadata_version(): u64 {
    METADATA_VERSION
}
