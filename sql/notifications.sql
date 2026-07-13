-- Notifications feature: run this once against the existing database.
-- The `fine` table already exists (see setup_db_v3.sql), so we only add
-- the `notification` table that backs the navbar bell + Notifications page.
USE `resource_centre_db`;

CREATE TABLE IF NOT EXISTS `notification` (
  `notification_id` INT NOT NULL AUTO_INCREMENT,
  `user_id` INT NOT NULL,
  `type` VARCHAR(50) NOT NULL,          -- e.g. request_approved, fine_issued, loan_due_soon
  `message` VARCHAR(500) NOT NULL,
  `is_read` TINYINT NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`notification_id`),
  INDEX `fk_notification_user_idx` (`user_id` ASC),
  CONSTRAINT `fk_notification_user`
    FOREIGN KEY (`user_id`)
    REFERENCES `resource_centre_db`.`user` (`user_id`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION)
ENGINE = InnoDB;
