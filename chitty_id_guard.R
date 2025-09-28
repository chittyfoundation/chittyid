# chitty_id_guard.R
# Enforce remote-only ID minting + continuous validation against id.chitty.cc

# Dependencies
suppressPackageStartupMessages({
  require(httr)
  require(jsonlite)
  require(digest)
})

CHITTY_BASE <- Sys.getenv("CHITTY_BASE", "https://id.chitty.cc")
ENFORCE_REMOTE_ONLY <- TRUE   # never allow local ID creation
HTTP_TIMEOUT <- as.numeric(Sys.getenv("CHITTY_HTTP_TIMEOUT", "10"))

# Strict on-wire format gate (matches Worker's isValidChittyID)
.is_chitty_id_format <- function(id) {
  grepl("^\\d{2}-\\d-[A-Z]{3}-\\d{4}-[A-Z]-\\d{4}-\\d-\\d$", id)
}

# Call the service validator: GET /validate?id=...
validate_chitty_id <- function(id) {
  stopifnot(is.character(id), length(id) == 1)
  if (!.is_chitty_id_format(id)) {
    return(list(valid = FALSE, reason = "regex_reject"))
  }
  url <- paste0(CHITTY_BASE, "/validate?id=", URLencode(id, reserved = TRUE))
  resp <- httr::GET(url, timeout(HTTP_TIMEOUT))
  if (httr::http_error(resp)) {
    return(list(valid = FALSE, reason = paste0("http_", httr::status_code(resp))))
  }
  out <- jsonlite::fromJSON(httr::content(resp, as = "text", encoding = "UTF-8"))
  list(valid = isTRUE(out$valid), parsed = out$parsed %||% NULL, reason = if (isTRUE(out$valid)) "ok" else "service_reject")
}

# Mint-by-proxy: POST to your ingestion endpoint at id.chitty.cc only.
# Never synthesize IDs locally.
mint_chitty_id <- function(source = c("notion","drive","github","financial"), payload = list(), api_key = Sys.getenv("CHITTY_API_KEY")) {
  if (ENFORCE_REMOTE_ONLY && !grepl("^https://id\\.chitty\\.cc($|/)", CHITTY_BASE)) {
    stop("Remote-only minting enforced. CHITTY_BASE must be https://id.chitty.cc")
  }
  source <- match.arg(source)
  endpoint <- paste0(CHITTY_BASE, "/ingest/", source)
  hdrs <- c(
    "Content-Type" = "application/json",
    "Authorization" = if (nzchar(api_key)) paste("Bearer", api_key) else NULL
  )
  resp <- httr::POST(endpoint, body = jsonlite::toJSON(payload, auto_unbox = TRUE), add_headers(.headers = hdrs), timeout(HTTP_TIMEOUT))
  if (httr::http_error(resp)) stop("Mint request failed: HTTP ", httr::status_code(resp))
  out <- jsonlite::fromJSON(httr::content(resp, as = "text", encoding = "UTF-8"))
  id <- out$chitty_id %||% out$chittyId
  if (is.null(id)) stop("Mint response missing chitty_id")
  v <- validate_chitty_id(id)
  if (!isTRUE(v$valid)) stop("Service returned non-valid ID")
  return(id)
}

# Batch validator with caching for efficiency
validate_ids <- function(ids) {
  stopifnot(is.character(ids))
  cache <- new.env(parent = emptyenv())
  results <- lapply(ids, function(id) {
    if (exists(id, envir = cache, inherits = FALSE)) return(get(id, envir = cache))
    res <- validate_chitty_id(id)
    assign(id, res, envir = cache)
    c(id = id, valid = as.character(res$valid), reason = res$reason %||% "")
  })
  do.call(rbind, results)
}

# Optional: periodic re-validation loop (run this script via cron/systemd/taskscheduleR)
# Example cron: */15 * * * * Rscript /path/chitty_id_guard.R --recheck /path/ids.txt
revalidate_loop <- function(ids, interval_sec = 900, iterations = Inf) {
  i <- 0L
  while (i < iterations) {
    cat(format(Sys.time()), "revalidate start\n")
    res <- validate_ids(ids)
    bad <- res[res[, "valid"] != "TRUE", , drop = FALSE]
    if (nrow(bad)) {
      write.table(bad, file = "chitty_invalid_ids.log", sep = ",", row.names = FALSE, col.names = FALSE, append = TRUE, quote = FALSE)
    }
    Sys.sleep(interval_sec)
    i <- i + 1L
  }
}

# CLI entry
args <- commandArgs(trailingOnly = TRUE)
if (length(args) >= 1 && args[1] == "--recheck") {
  ids <- scan(args[2], what = character(), quiet = TRUE)
  revalidate_loop(ids)
}